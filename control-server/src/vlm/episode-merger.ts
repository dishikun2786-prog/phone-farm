/**
 * Episode Merger — Merges multiple VLM episodes for the same task into an optimal script.
 *
 * Merging algorithm:
 *   1. Load all episode step sequences
 *   2. Align steps by position index across episodes
 *   3. For each step position, compute:
 *      - Success rate (fraction of episodes where this step succeeded)
 *      - Dominant action (most common action type and target)
 *      - Selector consensus (best UI selector across episodes)
 *   4. Build fallback chains for steps with divergent actions
 *   5. Generate a merged CompiledScript with best selectors and fallbacks
 *
 * Scoring dimensions:
 *   - Step success rate: what fraction of episodes completed this step?
 *   - Action consensus: do episodes agree on what action to take?
 *   - Selector stability: id > text+className > text > desc > className > coordinate
 */
import type { EpisodeData, EpisodeStep } from './episode-recorder';
import { scoreSelectorStability, type CompiledScript, type NodeSelector } from './script-compiler';
import type { VLMAction } from './vlm-client';

/** Input for the merger: a labeled set of episodes for the same task. */
export interface MergeInput {
  /** Episodes to merge (all should be for the same task) */
  episodes: EpisodeData[];
  /** Task name / script name for the output */
  scriptName: string;
  /** Target platform (dy/ks/wx/xhs) */
  platform: string;
  /** Optional pre-resolved node selectors keyed by episodeId -> stepIndex -> selector */
  selectorsByEpisode?: Map<string, Map<number, NodeSelector>>;
}

/** Per-step statistics across all merged episodes. */
export interface StepConsensus {
  stepIndex: number;
  /** Number of episodes that reached this step */
  episodeCount: number;
  /** Fraction of episodes where this step succeeded (did not error) */
  successRate: number;
  /** The dominant action type at this step */
  dominantAction: VLMAction;
  /** How many episodes agree on the dominant action (0-1) */
  actionConsensus: number;
  /** Alternative actions from episodes that diverged */
  alternatives: VLMAction[];
  /** Best node selector for this step (if available) */
  bestSelector: NodeSelector | null;
  /** Fallback selectors ordered by stability score */
  fallbackSelectors: NodeSelector[];
  /** Average duration for this step across episodes (ms) */
  avgDurationMs: number;
}

/** Result of merging episodes. */
export interface MergeResult {
  scriptName: string;
  platform: string;
  episodeCount: number;
  /** Consensus for each step position */
  consensus: StepConsensus[];
  /** The merged compiled script */
  compiled: CompiledScript;
  /** Summary statistics */
  stats: {
    totalUniqueSteps: number;
    averageSuccessRate: number;
    averageActionConsensus: number;
    totalFallbackSteps: number;
  };
}

/**
 * Merge multiple episodes into an optimal script.
 */
export function mergeEpisodes(input: MergeInput): MergeResult {
  const { episodes, scriptName, platform, selectorsByEpisode } = input;

  if (episodes.length === 0) {
    throw new Error('At least one episode is required for merging');
  }

  // Step 1: Determine max step count for alignment
  const maxSteps = Math.max(...episodes.map(e => e.steps.length));

  // Step 2: For each step position, collect actions from all episodes
  const consensus: StepConsensus[] = [];

  for (let stepIdx = 0; stepIdx < maxSteps; stepIdx++) {
    const actionsAtStep: VLMAction[] = [];
    const selectorsAtStep: NodeSelector[] = [];
    let successCount = 0;

    for (const episode of episodes) {
      if (stepIdx < episode.steps.length) {
        const step = episode.steps[stepIdx];
        const action = normalizeAction(step.action);

        // Only count as "reached" if it was a meaningful action
        if (action.type !== 'terminate' || step.finished) {
          actionsAtStep.push(action);
          successCount++;

          // Collect selectors if provided
          if (selectorsByEpisode?.has(episode.meta.episodeId)) {
            const epSelectors = selectorsByEpisode.get(episode.meta.episodeId)!;
            const sel = epSelectors.get(stepIdx);
            if (sel) selectorsAtStep.push(sel);
          }
        }
      }
    }

    if (actionsAtStep.length === 0) {
      // No episode reached this step
      consensus.push({
        stepIndex: stepIdx,
        episodeCount: 0,
        successRate: 0,
        dominantAction: { type: 'tap', x: 540, y: 1200 },
        actionConsensus: 0,
        alternatives: [],
        bestSelector: null,
        fallbackSelectors: [],
        avgDurationMs: 0,
      });
      continue;
    }

    // Step 3: Find the dominant action by frequency
    const actionCounts = groupActions(actionsAtStep);
    const sortedActions = [...actionCounts.entries()].sort((a, b) => b[1] - a[1]);
    const [dominantAction, dominantCount] = sortedActions[0];
    const parsedDominant = JSON.parse(dominantAction) as VLMAction;

    // Step 4: Collect alternatives (actions that differ from dominant)
    const alternatives: VLMAction[] = [];
    for (let i = 1; i < sortedActions.length; i++) {
      alternatives.push(JSON.parse(sortedActions[i][0]) as VLMAction);
    }

    // Step 5: Resolve best selector
    let bestSelector: NodeSelector | null = null;
    const fallbackSelectors: NodeSelector[] = [];

    if (selectorsAtStep.length > 0) {
      // Score each selector by stability, pick best
      const scoredSelectors = selectorsAtStep.map(s => ({
        selector: s,
        score: scoreSelectorStability(s),
      }));
      scoredSelectors.sort((a, b) => b.score - a.score);

      bestSelector = scoredSelectors[0].selector;
      // Remaining selectors become fallbacks (excluding duplicates by value)
      const seenValues = new Set<string>();
      seenValues.add(selectorKey(bestSelector));
      for (let i = 1; i < scoredSelectors.length; i++) {
        const key = selectorKey(scoredSelectors[i].selector);
        if (!seenValues.has(key)) {
          fallbackSelectors.push(scoredSelectors[i].selector);
          seenValues.add(key);
        }
      }
    } else {
      // Build synthetic selector from the dominant action coordinates
      bestSelector = actionToSelector(parsedDominant);
    }

    const actionConsensus = dominantCount / actionsAtStep.length;
    const successRate = successCount / episodes.length;

    consensus.push({
      stepIndex: stepIdx,
      episodeCount: actionsAtStep.length,
      successRate: Math.round(successRate * 100) / 100,
      dominantAction: parsedDominant,
      actionConsensus: Math.round(actionConsensus * 100) / 100,
      alternatives,
      bestSelector,
      fallbackSelectors,
      avgDurationMs: 0, // EpisodeStep doesn't track per-step duration
    });
  }

  // Step 6: Build compiled script from consensus
  const compiled = consensusToScript(consensus, scriptName, platform);

  // Step 7: Compute summary stats
  const validConsensus = consensus.filter(c => c.episodeCount > 0);
  const stats = {
    totalUniqueSteps: validConsensus.length,
    averageSuccessRate: validConsensus.length > 0
      ? Math.round((validConsensus.reduce((s, c) => s + c.successRate, 0) / validConsensus.length) * 100) / 100
      : 0,
    averageActionConsensus: validConsensus.length > 0
      ? Math.round((validConsensus.reduce((s, c) => s + c.actionConsensus, 0) / validConsensus.length) * 100) / 100
      : 0,
    totalFallbackSteps: validConsensus.filter(c => c.fallbackSelectors.length > 0).length,
  };

  return {
    scriptName,
    platform,
    episodeCount: episodes.length,
    consensus,
    compiled,
    stats,
  };
}

/**
 * Convert consensus array into a CompiledScript with fallback logic.
 */
function consensusToScript(
  consensus: StepConsensus[],
  name: string,
  platform: string,
): CompiledScript {
  const lines: string[] = [];
  let selectorCount = 0;

  lines.push('/**');
  lines.push(' * Auto-generated by Episode Merger');
  lines.push(` * Platform: ${platform}`);
  lines.push(` * Merged from ${consensus.filter(c => c.episodeCount > 0).length} consensus steps`);
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(' * Contains fallback chains for steps with low consensus');
  lines.push(' */');
  lines.push('');
  lines.push('var AppAutomation = global.AppAutomation;');
  lines.push('var remoteBridge = global.remoteBridge;');
  lines.push('');
  lines.push(`// Task: ${name}`);
  lines.push('function main() {');

  for (const step of consensus) {
    if (step.episodeCount === 0) continue;

    lines.push(`  // Step ${step.stepIndex} (successRate: ${Math.round(step.successRate * 100)}%, consensus: ${Math.round(step.actionConsensus * 100)}%)`);

    if (step.fallbackSelectors.length > 0 && step.bestSelector) {
      // Generate primary selector line
      selectorCount++;
      lines.push(`  // Primary selector (stability: ${scoreSelectorStability(step.bestSelector)})`);
      lines.push(`  ${selectorToLine(step.bestSelector)}`);

      // Generate fallback chain
      for (let fi = 0; fi < step.fallbackSelectors.length; fi++) {
        const fb = step.fallbackSelectors[fi];
        selectorCount++;
        lines.push(`  // Fallback ${fi + 1}: stability=${scoreSelectorStability(fb)}`);
        lines.push(`  if (!taskSuccess) { ${selectorToLine(fb)} }`);
      }
    } else if (step.bestSelector) {
      selectorCount++;
      lines.push(`  ${selectorToLine(step.bestSelector)}`);
    } else {
      lines.push(`  ${actionToLine(step.dominantAction)}`);
    }

    lines.push(`  sleep(500);`);
    lines.push('');
  }

  lines.push('  taskSuccess = true;');
  lines.push('  remoteBridge.sendTaskResult("completed", { steps: ' + consensus.filter(c => c.episodeCount > 0).length + ' });');
  lines.push('}');
  lines.push('');
  lines.push('var taskSuccess = false;');
  lines.push('main();');

  return {
    name,
    platform,
    targetRuntime: 'deeke' as const,
    sourceCode: lines.join('\n'),
    selectorCount,
    totalSteps: consensus.filter(c => c.episodeCount > 0).length,
  };
}

// ── Helpers ──

/** Normalize an EpisodeStep action into a canonical VLMAction. */
function normalizeAction(action: Record<string, unknown>): VLMAction {
  const atype = (action.type as string) || (action.action as string) || 'tap';
  switch (atype) {
    case 'tap':
      return {
        type: 'tap',
        x: (action.x as number) || (action.coordinates as Record<string, number>)?.x || 540,
        y: (action.y as number) || (action.coordinates as Record<string, number>)?.y || 1200,
      };
    case 'long_press':
      return {
        type: 'long_press',
        x: (action.x as number) || 540,
        y: (action.y as number) || 1200,
      };
    case 'swipe':
      return {
        type: 'swipe',
        x: (action.x as number) || (action.x1 as number) || 0,
        y: (action.y as number) || (action.y1 as number) || 0,
        x2: (action.x2 as number) || 0,
        y2: (action.y2 as number) || 0,
      };
    case 'type':
      return { type: 'type', text: (action.text as string) || '' };
    case 'back':
      return { type: 'back' };
    case 'home':
      return { type: 'home' };
    case 'launch':
      return { type: 'launch', package: (action.package as string) || '' };
    case 'terminate':
    case 'answer':
      return { type: 'terminate', message: (action.message as string) || 'Done' };
    default:
      return { type: 'tap', x: 540, y: 1200 };
  }
}

/**
 * Group actions by their JSON representation for frequency counting.
 * Coordinates are rounded to reduce noise from minor pixel variations.
 */
function groupActions(actions: VLMAction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const action of actions) {
    const key = actionToString(action);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

/** Serialize an action to a stable string key for grouping. */
function actionToString(action: VLMAction): string {
  switch (action.type) {
    case 'tap':
      return JSON.stringify({ type: 'tap', x: roundCoord(action.x), y: roundCoord(action.y) });
    case 'swipe':
      return JSON.stringify({
        type: 'swipe',
        x: roundCoord(action.x), y: roundCoord(action.y),
        x2: roundCoord(action.x2), y2: roundCoord(action.y2),
      });
    case 'type':
      return JSON.stringify({ type: 'type', text: action.text });
    case 'long_press':
      return JSON.stringify({ type: 'long_press', x: roundCoord(action.x), y: roundCoord(action.y) });
    default:
      return JSON.stringify({ type: action.type });
  }
}

/**
 * Round coordinates to nearest 10px to group nearby taps as "same action".
 * This accounts for minor coordinate variations across episodes.
 */
function roundCoord(val?: number): number {
  if (val === undefined) return 0;
  return Math.round(val / 10) * 10;
}

/** Build a synthetic NodeSelector from a coordinate-based action. */
function actionToSelector(action: VLMAction): NodeSelector {
  switch (action.type) {
    case 'tap':
      return {
        type: 'coordinate',
        value: `${action.x},${action.y}`,
        x: action.x,
        y: action.y,
        stability: 0,
      };
    case 'swipe':
      return {
        type: 'coordinate',
        value: `swipe(${action.x},${action.y}->${action.x2},${action.y2})`,
        x: action.x,
        y: action.y,
        stability: 0,
      };
    case 'type':
      return {
        type: 'text',
        value: action.text || '',
        stability: 70,
      };
    case 'back':
      return { type: 'text', value: 'back()', stability: 100 };
    case 'home':
      return { type: 'text', value: 'home()', stability: 100 };
    case 'launch':
      return { type: 'text', value: `launch(${action.package})`, stability: 90 };
    default:
      return { type: 'coordinate', value: '540,1200', x: 540, y: 1200, stability: 0 };
  }
}

/** Create a unique key for a selector for deduplication. */
function selectorKey(sel: NodeSelector): string {
  return `${sel.type}:${sel.value}`;
}

/** Convert a NodeSelector to a line of DeekeScript code. */
function selectorToLine(sel: NodeSelector): string {
  switch (sel.type) {
    case 'id':
      return `AppAutomation.clickById('${sel.value}');`;
    case 'text':
      return `AppAutomation.clickByText('${sel.value}');`;
    case 'desc':
      return `AppAutomation.clickByDesc('${sel.value}');`;
    case 'textContains':
      return `AppAutomation.safeClick(function() { return UiSelector().textContains('${sel.value}').clickable(true); });`;
    case 'descContains':
      return `AppAutomation.safeClick(function() { return UiSelector().descContains('${sel.value}').clickable(true); });`;
    case 'className':
      return `AppAutomation.safeClick(function() { return UiSelector().className('${sel.value}').clickable(true); });`;
    case 'coordinate':
      return `AppAutomation.clickXY(${sel.x}, ${sel.y});`;
    default:
      return `// Unknown selector: ${sel.type}`;
  }
}

/** Convert a VLMAction to a line of DeekeScript code. */
function actionToLine(action: VLMAction): string {
  switch (action.type) {
    case 'tap':
      return `Gesture.click(${action.x}, ${action.y});`;
    case 'swipe':
      return `Gesture.swipe(${action.x}, ${action.y}, ${action.x2}, ${action.y2}, 400);`;
    case 'type':
      return `KeyBoards.inputText('${(action.text || '').replace(/'/g, "\\'")}');`;
    case 'back':
      return 'Common.back();';
    case 'home':
      return 'Common.home();';
    case 'launch':
      return `App.launch('${action.package}');`;
    case 'long_press':
      return `Gesture.click(${action.x}, ${action.y}); sleep(800);`;
    default:
      return `// Unknown action: ${action.type}`;
  }
}

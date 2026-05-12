/**
 * Model A/B — Runs the same task across different VLM models and compares results.
 *
 * Use cases:
 *   - Evaluate which model performs best for a given task type
 *   - Compare cost vs. accuracy tradeoffs between models
 *   - Generate human-readable comparison reports (markdown and ASCII table)
 *
 * Comparison dimensions:
 *   - Steps taken to completion
 *   - Success rate (did the task finish without errors?)
 *   - Total duration and average step duration
 *   - Estimated API cost (based on token and image counts)
 *   - Action efficiency (useful steps vs. redundant steps)
 *   - Thinking depth (average reasoning output length per step)
 *
 * Two output formats are supported:
 *   - ABTestResult: structured data for API consumers
 *   - formatComparisonReport(): ASCII table for terminal/CLI display
 *
 * Each model is defined with its pricing parameters for cost estimation.
 */
import type { EpisodeData } from './episode-recorder';
import type { VLMAction, ModelType } from './vlm-client';

/** Configuration for a single model in the comparison. */
export interface ABModelConfig {
  name: string;
  apiUrl: string;
  /** Cost per 1K input tokens (USD) */
  costPer1kTokens: number;
  /** Cost per 1K output tokens (USD). Defaults to 3x input rate if not set. */
  costPer1kOutputTokens?: number;
  /** Cost per image processed (USD). Some models charge per-image. */
  costPerImage?: number;
}

/** Pricing parameters for cost estimation (USD). */
export interface ModelPricing {
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  perImage?: number;
  avgTokensPerStep: number;
  avgOutputTokensPerStep: number;
  currency: string;
}

/** A model under test with its configuration and episode. */
export interface ModelUnderTest {
  modelName: string;
  modelType: ModelType;
  pricing: ModelPricing;
  episode: EpisodeData;
  stepLatenciesMs?: number[];
}

/** Single-model metrics computed from an episode. */
export interface ModelMetrics {
  modelName: string;
  modelType: ModelType;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  status: string;
  totalDurationMs: number;
  avgStepDurationMs: number;
  avgThinkingLength: number;
  estimatedCost: number;
  errorSteps: number[];
  actionTypes: Record<string, number>;
  efficiencyScore: number;
}

/** Head-to-head comparison between two models. */
export interface ModelComparison {
  modelA: ModelMetrics;
  modelB: ModelMetrics;
  winner: {
    fewerSteps: 'A' | 'B' | 'tie';
    higherSuccessRate: 'A' | 'B' | 'tie';
    faster: 'A' | 'B' | 'tie';
    cheaper: 'A' | 'B' | 'tie';
    betterEfficiency: 'A' | 'B' | 'tie';
    deeperThinking: 'A' | 'B' | 'tie';
    overall: 'A' | 'B' | 'tie';
  };
  scores: {
    steps: { A: number; B: number };
    success: { A: number; B: number };
    speed: { A: number; B: number };
    cost: { A: number; B: number };
    efficiency: { A: number; B: number };
    thinking: { A: number; B: number };
  };
}

/** Per-step result from a single model run. */
export interface ABStep {
  stepNumber: number;
  modelName: string;
  action: VLMAction;
  thinking: string;
  finished: boolean;
  durationMs: number;
}

/** Aggregate metrics for one model across all steps. */
export interface ABModelMetrics {
  modelName: string;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  successRate: number;
  totalDurationMs: number;
  avgStepDurationMs: number;
  finished: boolean;
  finishMessage: string;
  estimatedTokens: number;
  estimatedCost: number;
}

/** Full A/B test result. */
export interface ABTestResult {
  taskName: string;
  models: ModelMetrics[];
  comparisons: ModelComparison[];
  recommendation: string;
  report: string;
  testedAt: string;
}

/** Full A/B comparison result (compatible with existing consumers). */
export interface ABComparisonResult {
  task: string;
  startedAt: string;
  finishedAt: string;
  models: ABModelMetrics[];
  winner: {
    successRate: string;
    speed: string;
    cost: string;
    overall: string;
  };
  stepsByModel: Map<string, ABStep[]>;
}

/**
 * Default pricing for known VLM models (USD, May 2026 estimates).
 */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'autoglm-phone-9b': {
    inputPer1kTokens: 0.0005,
    outputPer1kTokens: 0.0015,
    perImage: 0.001,
    avgTokensPerStep: 800,
    avgOutputTokensPerStep: 200,
    currency: 'USD',
  },
  'autoglm-phone-72b': {
    inputPer1kTokens: 0.002,
    outputPer1kTokens: 0.006,
    perImage: 0.003,
    avgTokensPerStep: 1200,
    avgOutputTokensPerStep: 300,
    currency: 'USD',
  },
  'qwen-vl-max': {
    inputPer1kTokens: 0.003,
    outputPer1kTokens: 0.009,
    avgTokensPerStep: 900,
    avgOutputTokensPerStep: 250,
    currency: 'USD',
  },
  'ui-tars-72b': {
    inputPer1kTokens: 0.002,
    outputPer1kTokens: 0.006,
    avgTokensPerStep: 1000,
    avgOutputTokensPerStep: 200,
    currency: 'USD',
  },
  'maiui-7b': {
    inputPer1kTokens: 0.0003,
    outputPer1kTokens: 0.0009,
    perImage: 0.0005,
    avgTokensPerStep: 600,
    avgOutputTokensPerStep: 150,
    currency: 'USD',
  },
  'gui-owl': {
    inputPer1kTokens: 0.001,
    outputPer1kTokens: 0.003,
    avgTokensPerStep: 700,
    avgOutputTokensPerStep: 180,
    currency: 'USD',
  },
};

/** Default models to compare. */
export const DEFAULT_AB_MODELS: ABModelConfig[] = [
  { name: 'autoglm-phone-9b', apiUrl: 'http://localhost:5000/api/vlm/execute', costPer1kTokens: 0.0005 },
  { name: 'qwen-vl-max', apiUrl: 'http://localhost:5000/api/vlm/execute', costPer1kTokens: 0.003 },
];

/**
 * Run an A/B comparison between two or more models on the same task.
 */
export function runABTest(
  taskName: string,
  models: ModelUnderTest[],
): ABTestResult {
  if (models.length < 2) {
    throw new Error('At least 2 models are required for A/B testing');
  }

  const metricsList: ModelMetrics[] = models.map(m => computeMetrics(m));

  const comparisons: ModelComparison[] = [];
  for (let i = 0; i < metricsList.length; i++) {
    for (let j = i + 1; j < metricsList.length; j++) {
      comparisons.push(compareModels(metricsList[i], metricsList[j]));
    }
  }

  const recommendation = pickBestModel(metricsList);
  const report = generateReport(taskName, metricsList, comparisons, recommendation);

  return {
    taskName,
    models: metricsList,
    comparisons,
    recommendation,
    report,
    testedAt: new Date().toISOString(),
  };
}

/**
 * Compute per-model metrics from an episode.
 */
export function computeMetrics(model: ModelUnderTest): ModelMetrics {
  const { episode, modelName, modelType, pricing } = model;
  const steps = episode.steps;
  const meta = episode.meta;

  const totalSteps = steps.length;
  const failedCount = steps.filter(s => isErrorAction(s.action)).length;
  const completedSteps = totalSteps - failedCount;

  const errorSteps: number[] = [];
  for (const step of steps) {
    if (isErrorAction(step.action)) {
      errorSteps.push(step.step);
    }
  }

  const thinkingLengths = steps
    .map(s => s.modelOutput?.length || 0)
    .filter(l => l > 0);
  const avgThinkingLength = thinkingLengths.length > 0
    ? Math.round(thinkingLengths.reduce((a, b) => a + b, 0) / thinkingLengths.length)
    : 0;

  const totalDurationMs = meta.totalDurationMs;
  const avgStepDurationMs = totalSteps > 0 ? Math.round(totalDurationMs / totalSteps) : 0;

  const estimatedCost = estimateCost(pricing, totalSteps);

  const actionTypes: Record<string, number> = {};
  for (const step of steps) {
    const atype = normalizeActionType(step.action);
    actionTypes[atype] = (actionTypes[atype] || 0) + 1;
  }

  let redundantCount = 0;
  for (let i = 1; i < steps.length; i++) {
    const prev = normalizeActionType(steps[i - 1].action);
    const curr = normalizeActionType(steps[i].action);
    if (prev === curr && curr === 'terminate') {
      redundantCount++;
    }
  }
  const efficiencyScore = totalSteps > 0
    ? Math.round((1 - redundantCount / totalSteps) * 100)
    : 100;

  return {
    modelName,
    modelType,
    totalSteps,
    completedSteps,
    failedSteps: failedCount,
    status: meta.status,
    totalDurationMs,
    avgStepDurationMs,
    avgThinkingLength,
    estimatedCost: Math.round(estimatedCost * 10000) / 10000,
    errorSteps,
    actionTypes,
    efficiencyScore,
  };
}

/**
 * Compare two models head-to-head.
 */
export function compareModels(a: ModelMetrics, b: ModelMetrics): ModelComparison {
  const winner = {
    fewerSteps: a.totalSteps < b.totalSteps ? 'A' as const
      : b.totalSteps < a.totalSteps ? 'B' as const : 'tie' as const,
    higherSuccessRate: a.completedSteps > b.completedSteps ? 'A' as const
      : b.completedSteps > a.completedSteps ? 'B' as const : 'tie' as const,
    faster: a.totalDurationMs < b.totalDurationMs ? 'A' as const
      : b.totalDurationMs < a.totalDurationMs ? 'B' as const : 'tie' as const,
    cheaper: a.estimatedCost < b.estimatedCost ? 'A' as const
      : b.estimatedCost < a.estimatedCost ? 'B' as const : 'tie' as const,
    betterEfficiency: a.efficiencyScore > b.efficiencyScore ? 'A' as const
      : b.efficiencyScore > a.efficiencyScore ? 'B' as const : 'tie' as const,
    deeperThinking: a.avgThinkingLength > b.avgThinkingLength ? 'A' as const
      : b.avgThinkingLength > a.avgThinkingLength ? 'B' as const : 'tie' as const,
    overall: 'tie' as 'A' | 'B' | 'tie',
  };

  const scores = {
    steps: normalizePair(a.totalSteps, b.totalSteps, true),
    success: normalizePair(a.completedSteps, b.completedSteps, false),
    speed: normalizePair(a.totalDurationMs, b.totalDurationMs, true),
    cost: normalizePair(a.estimatedCost, b.estimatedCost, true),
    efficiency: normalizePair(a.efficiencyScore, b.efficiencyScore, false),
    thinking: normalizePair(a.avgThinkingLength, b.avgThinkingLength, false),
  };

  const dims = ['fewerSteps', 'higherSuccessRate', 'faster', 'cheaper', 'betterEfficiency', 'deeperThinking'] as const;
  let aWins = 0, bWins = 0;
  for (const dim of dims) {
    if (winner[dim] === 'A') aWins++;
    else if (winner[dim] === 'B') bWins++;
  }
  winner.overall = aWins > bWins ? 'A' : bWins > aWins ? 'B' : 'tie';

  return { modelA: a, modelB: b, winner, scores };
}

/**
 * Pick the best model from a list using weighted scoring.
 * Weights: success (35%), cost (25%), speed (20%), efficiency (10%), thinking (10%).
 */
function pickBestModel(metrics: ModelMetrics[]): string {
  if (metrics.length === 0) return 'none';
  if (metrics.length === 1) return metrics[0].modelName;

  const weights = { success: 0.35, cost: 0.25, speed: 0.20, efficiency: 0.10, thinking: 0.10 };

  let bestModel = metrics[0].modelName;
  let bestScore = -Infinity;

  const normalized = normalizeAll(metrics);

  for (let i = 0; i < metrics.length; i++) {
    const n = normalized[i];
    const score =
      n.success * weights.success +
      n.cost * weights.cost +
      n.speed * weights.speed +
      n.efficiency * weights.efficiency +
      n.thinking * weights.thinking;

    if (score > bestScore) {
      bestScore = score;
      bestModel = metrics[i].modelName;
    }
  }

  return bestModel;
}

/**
 * Estimate the API cost for a model completing a given number of steps.
 */
export function estimateCost(pricing: ModelPricing, totalSteps: number): number {
  const { avgTokensPerStep, avgOutputTokensPerStep, inputPer1kTokens, outputPer1kTokens } = pricing;

  const inputCost = (avgTokensPerStep / 1000) * inputPer1kTokens * totalSteps;
  const outputCost = (avgOutputTokensPerStep / 1000) * outputPer1kTokens * totalSteps;
  let imageCost = 0;

  if (pricing.perImage) {
    imageCost = pricing.perImage * totalSteps;
  }

  return inputCost + outputCost + imageCost;
}

/**
 * Compute cost estimate based on rough token counts.
 * A 1080x2400 JPEG screenshot at 50% quality is ~50KB base64 = ~67K chars = ~8K tokens.
 * Each step: ~1K tokens text + ~8K tokens image input, ~200 tokens output.
 */
export function estimateStepCost(
  stepCount: number,
  costPer1kInput: number,
  costPer1kOutput: number = 0.0003,
): { tokens: number; cost: number } {
  const inputTokens = stepCount * 9000; // 8K image + 1K text
  const totalOutput = stepCount * 200;
  const cost = (inputTokens / 1000) * costPer1kInput + (totalOutput / 1000) * costPer1kOutput;
  return { tokens: inputTokens + totalOutput, cost: Math.round(cost * 10000) / 10000 };
}

/**
 * Build A/B comparison metrics from per-model step arrays.
 */
export function buildComparison(
  task: string,
  modelConfigs: ABModelConfig[],
  stepsByModel: Map<string, ABStep[]>,
  startedAt: string,
): ABComparisonResult {
  const models: ABModelMetrics[] = [];

  for (const cfg of modelConfigs) {
    const steps = stepsByModel.get(cfg.name) || [];
    const sortedSteps = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
    const successfulSteps = sortedSteps.filter(s => !s.finished || !isTerminateAction(s.action)).length;
    const failedSteps = sortedSteps.length - successfulSteps;
    const totalDurationMs = sortedSteps.reduce((sum, s) => sum + s.durationMs, 0);
    const finished = sortedSteps.length > 0
      ? sortedSteps[sortedSteps.length - 1].finished
      : false;

    const outputRate = cfg.costPer1kOutputTokens || cfg.costPer1kTokens * 3;
    const { tokens, cost } = estimateStepCost(
      sortedSteps.length,
      cfg.costPer1kTokens,
      outputRate,
    );

    const lastAction = finished && sortedSteps.length > 0
      ? (sortedSteps[sortedSteps.length - 1].action as unknown as Record<string, unknown>)
      : null;
    const finishMsg = lastAction ? (lastAction.message as string) || 'Done' : '';

    models.push({
      modelName: cfg.name,
      totalSteps: sortedSteps.length,
      successfulSteps,
      failedSteps,
      successRate: sortedSteps.length > 0
        ? Math.round((successfulSteps / sortedSteps.length) * 100) / 100
        : 0,
      totalDurationMs,
      avgStepDurationMs: sortedSteps.length > 0
        ? Math.round(totalDurationMs / sortedSteps.length)
        : 0,
      finished,
      finishMessage: finishMsg,
      estimatedTokens: tokens,
      estimatedCost: cost,
    });
  }

  const sortedBySuccess = [...models].sort((a, b) => b.successRate - a.successRate);
  const sortedBySpeed = [...models].sort((a, b) => a.avgStepDurationMs - b.avgStepDurationMs);
  const sortedByCost = [...models].sort((a, b) => a.estimatedCost - b.estimatedCost);

  // Overall score: +3 for 1st, +2 for 2nd, +1 for 3rd per category
  const scores = new Map<string, number>();
  for (const m of models) scores.set(m.modelName, 0);

  sortedBySuccess.forEach((m, i) => scores.set(m.modelName, scores.get(m.modelName)! + (3 - i)));
  sortedBySpeed.forEach((m, i) => scores.set(m.modelName, scores.get(m.modelName)! + (3 - i)));
  sortedByCost.forEach((m, i) => scores.set(m.modelName, scores.get(m.modelName)! + (3 - i)));

  let overallWinner = models[0]?.modelName || '';
  let maxScore = -1;
  for (const [name, score] of scores) {
    if (score > maxScore) {
      maxScore = score;
      overallWinner = name;
    }
  }

  return {
    task,
    startedAt,
    finishedAt: new Date().toISOString(),
    models,
    winner: {
      successRate: sortedBySuccess[0]?.modelName || '',
      speed: sortedBySpeed[0]?.modelName || '',
      cost: sortedByCost[0]?.modelName || '',
      overall: overallWinner,
    },
    stepsByModel,
  };
}

/**
 * Format an A/B comparison result as a human-readable ASCII table.
 */
export function formatComparisonReport(result: ABComparisonResult): string {
  const lines: string[] = [];
  lines.push('+==========================================================+');
  lines.push('|  VLM Model A/B Comparison Report                        |');
  lines.push('+==========================================================+');
  lines.push(`|  Task: ${(result.task || '-').padEnd(51)}|`);
  lines.push('+==========================================================+');

  const header = `| ${'Model'.padEnd(20)} ${'Steps'.padStart(6)} ${'SR%'.padStart(5)} ${'AvgMs'.padStart(6)} ${'Cost'.padStart(8)} |`;
  lines.push(header);
  lines.push('+----------------------------------------------------------+');

  for (const m of result.models) {
    const name = m.modelName.slice(0, 18).padEnd(20);
    const steps = String(m.totalSteps).padStart(6);
    const sr = `${Math.round(m.successRate * 100)}`.padStart(5);
    const avg = String(m.avgStepDurationMs).padStart(6);
    const cost = `$${m.estimatedCost.toFixed(4)}`.padStart(8);
    lines.push(`| ${name}${steps}${sr}${avg}${cost} |`);
  }

  lines.push('+==========================================================+');
  lines.push('|  Winners:                                               |');
  lines.push(`|    Success Rate: ${result.winner.successRate.padEnd(40)}|`);
  lines.push(`|    Speed:        ${result.winner.speed.padEnd(40)}|`);
  lines.push(`|    Cost:         ${result.winner.cost.padEnd(40)}|`);
  lines.push(`|    Overall:      ${result.winner.overall.padEnd(40)}|`);
  lines.push('+==========================================================+');

  return lines.join('\n');
}

// ── Internal helpers ──

function isErrorAction(action: Record<string, unknown>): boolean {
  const atype = (action.type as string) || (action.action as string) || '';
  return atype === 'error' || atype === 'retry' || atype === '';
}

function isTerminateAction(action: VLMAction): boolean {
  return action.type === 'terminate' || (action as unknown as Record<string, string>).type === 'error';
}

function normalizeActionType(action: Record<string, unknown>): string {
  const atype = (action.type as string) || (action.action as string) || 'unknown';
  if (atype === 'terminate' || atype === 'answer') return 'terminate';
  return atype;
}

function normalizePair(a: number, b: number, lowerIsBetter: boolean): { A: number; B: number } {
  if (a === b) return { A: 100, B: 100 };
  if (a === 0 && b === 0) return { A: 100, B: 100 };

  if (lowerIsBetter) {
    const better = Math.min(a, b);
    const worse = Math.max(a, b);
    if (worse === 0) return { A: a === better ? 100 : 0, B: b === better ? 100 : 0 };
    return {
      A: Math.round((better / a) * 100),
      B: Math.round((better / b) * 100),
    };
  } else {
    const better = Math.max(a, b);
    if (better === 0) return { A: 0, B: 0 };
    return {
      A: Math.round((a / better) * 100),
      B: Math.round((b / better) * 100),
    };
  }
}

interface NormalizedMetrics {
  success: number;
  cost: number;
  speed: number;
  efficiency: number;
  thinking: number;
}

function normalizeAll(metrics: ModelMetrics[]): NormalizedMetrics[] {
  if (metrics.length <= 1) {
    return metrics.map(() => ({ success: 100, cost: 100, speed: 100, efficiency: 100, thinking: 100 }));
  }

  const maxSuccess = Math.max(...metrics.map(m => m.completedSteps));
  const minCost = Math.min(...metrics.map(m => m.estimatedCost));
  const maxCost = Math.max(...metrics.map(m => m.estimatedCost));
  const minDuration = Math.min(...metrics.map(m => m.totalDurationMs));
  const maxDuration = Math.max(...metrics.map(m => m.totalDurationMs));
  const maxThinking = Math.max(...metrics.map(m => m.avgThinkingLength));

  return metrics.map(m => ({
    success: maxSuccess > 0 ? Math.round((m.completedSteps / maxSuccess) * 100) : 0,
    cost: maxCost > minCost ? Math.round(((maxCost - m.estimatedCost) / (maxCost - minCost)) * 100) : 100,
    speed: maxDuration > minDuration ? Math.round(((maxDuration - m.totalDurationMs) / (maxDuration - minDuration)) * 100) : 100,
    efficiency: m.efficiencyScore,
    thinking: maxThinking > 0 ? Math.round((m.avgThinkingLength / maxThinking) * 100) : 0,
  }));
}

function generateReport(
  taskName: string,
  metrics: ModelMetrics[],
  comparisons: ModelComparison[],
  recommendation: string,
): string {
  const lines: string[] = [];

  lines.push('# VLM Model A/B Test Report');
  lines.push('');
  lines.push(`**Task:** ${taskName}`);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Models Tested:** ${metrics.length}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Model | Steps | Success | Duration | Cost | Efficiency | Think Depth |');
  lines.push('|-------|-------|---------|----------|------|------------|-------------|');

  for (const m of metrics) {
    const durationSec = (m.totalDurationMs / 1000).toFixed(1);
    lines.push(
      `| ${m.modelName} | ${m.totalSteps} | ${m.completedSteps}/${m.totalSteps} | ${durationSec}s | $${m.estimatedCost.toFixed(4)} | ${m.efficiencyScore}% | ${m.avgThinkingLength} chars |`,
    );
  }
  lines.push('');

  if (comparisons.length > 0) {
    lines.push('## Pairwise Comparisons');
    lines.push('');

    for (const comp of comparisons) {
      lines.push(`### ${comp.modelA.modelName} vs ${comp.modelB.modelName}`);
      lines.push('');

      lines.push('| Dimension | Winner | Score (A vs B) |');
      lines.push('|-----------|--------|----------------|');

      const dimLabels: Array<{ key: keyof typeof comp.winner; label: string; scoreKey: keyof typeof comp.scores }> = [
        { key: 'fewerSteps', label: 'Fewer Steps', scoreKey: 'steps' },
        { key: 'higherSuccessRate', label: 'Success Rate', scoreKey: 'success' },
        { key: 'faster', label: 'Speed', scoreKey: 'speed' },
        { key: 'cheaper', label: 'Cost', scoreKey: 'cost' },
        { key: 'betterEfficiency', label: 'Efficiency', scoreKey: 'efficiency' },
        { key: 'deeperThinking', label: 'Think Depth', scoreKey: 'thinking' },
      ];

      for (const { key, label, scoreKey } of dimLabels) {
        const winnerName = comp.winner[key] === 'A' ? comp.modelA.modelName
          : comp.winner[key] === 'B' ? comp.modelB.modelName : 'Tie';
        const scores = comp.scores[scoreKey];
        lines.push(`| ${label} | ${winnerName} | ${scores.A} vs ${scores.B} |`);
      }

      lines.push('');
      const overallName = comp.winner.overall === 'A' ? comp.modelA.modelName
        : comp.winner.overall === 'B' ? comp.modelB.modelName : 'Tie';
      lines.push(`**Overall Winner:** ${overallName}`);
      lines.push('');
    }
  }

  const allActionTypes = new Set<string>();
  for (const m of metrics) {
    for (const atype of Object.keys(m.actionTypes)) {
      allActionTypes.add(atype);
    }
  }

  if (allActionTypes.size > 0) {
    lines.push('## Action Type Breakdown');
    lines.push('');

    const headerCols = ['Action'].concat(metrics.map(m => m.modelName));
    lines.push(`| ${headerCols.join(' | ')} |`);
    lines.push(`|${headerCols.map(() => '-------').join('|')}|`);

    for (const atype of allActionTypes) {
      const counts = metrics.map(m => String(m.actionTypes[atype] || 0));
      lines.push(`| ${atype} | ${counts.join(' | ')} |`);
    }
    lines.push('');
  }

  lines.push('## Recommendation');
  lines.push('');
  lines.push(`**Best Model:** ${recommendation}`);
  lines.push('');

  const best = metrics.find(m => m.modelName === recommendation);
  if (best) {
    lines.push(`- Completed ${best.completedSteps}/${best.totalSteps} steps`);
    lines.push(`- Duration: ${(best.totalDurationMs / 1000).toFixed(1)}s`);
    lines.push(`- Estimated cost: $${best.estimatedCost.toFixed(4)}`);
    lines.push(`- Efficiency: ${best.efficiencyScore}%`);
  }

  lines.push('');
  lines.push('---');
  lines.push('*Report generated by VLM Model A/B Test*');

  return lines.join('\n');
}

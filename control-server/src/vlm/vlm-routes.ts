/**
 * VLM Routes — REST API + WebSocket integration for VLM-driven phone automation.
 *
 * Endpoints:
 *   POST /api/v1/vlm/execute           Start a VLM task on a device
 *   POST /api/v1/vlm/stop/:deviceId     Stop a running VLM task
 *   GET  /api/v1/vlm/episodes           List all VLM episodes (from filesystem)
 *   GET  /api/v1/vlm/episodes/:id       Get episode detail with steps + screenshot count
 *   POST /api/v1/vlm/episodes/:id/compile  Compile episode to DeekeScript
 *   DELETE /api/v1/vlm/episodes/:id     Delete an episode
 *   GET  /api/v1/vlm/scripts            List compiled scripts
 *   GET  /api/v1/vlm/scripts/:id        Get full script source code
 *   DELETE /api/v1/vlm/scripts/:id      Delete a compiled script
 *
 * WebSocket integration:
 *   - Subscribes to device screenshots during VLM task execution
 *   - Sends individual commands (tap/swipe/type/...) to device via existing WS channel
 */
import { type FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { VlmOrchestrator, type VlmTaskResult, type StepResult } from './vlm-orchestrator';
import type { VLMAction } from './vlm-client';
import { EpisodeRecorder, FileSystemEpisodeStore, type EpisodeSummary, type EpisodeData, type EpisodeStep } from './episode-recorder';
import { ScreenshotStore } from './screenshot-store';
import { compileEpisode, type CompiledScript, type NodeSelector } from './script-compiler';
import { config } from '../config';

export interface WsHubLike {
  sendToDevice(deviceId: string, message: object): boolean;
  isDeviceOnline(deviceId: string): boolean;
}

/** In-memory store for active orchestrators (prod: replace with Redis) */
const activeTasks = new Map<string, VlmOrchestrator>();
const completedTasks = new Map<string, VlmTaskResult>();

/** In-memory store for compiled scripts (prod: replace with vlm_scripts DB table) */
interface StoredScript {
  id: string;
  episodeId: string;
  name: string;
  platform: string;
  sourceCode: string;
  selectorCount: number;
  totalSteps: number;
  compiledAt: string;
  status: 'draft' | 'active' | 'archived';
}

const compiledScripts = new Map<string, StoredScript>();

/** Shared filesystem store for episode CRUD */
const fsStore = new FileSystemEpisodeStore();
const screenshotStore = new ScreenshotStore();

export function registerVlmRoutes(
  app: FastifyInstance,
  wsHub: WsHubLike,
): void {
  const vlmApiUrl = process.env.VLM_API_URL || 'http://localhost:5000/api/vlm/execute';
  const vlmModelName = process.env.VLM_MODEL_NAME || 'autoglm-phone-9b';

  // ── POST /vlm/execute — Start a VLM task ──
  app.post('/api/v1/vlm/execute', async (req, reply) => {
    const { deviceId, task, modelName, maxSteps, lang } = req.body as {
      deviceId: string;
      task: string;
      modelName?: string;
      maxSteps?: number;
      lang?: string;
    };

    if (!deviceId || !task) {
      return reply.status(400).send({ error: 'deviceId and task are required' });
    }

    if (!wsHub.isDeviceOnline(deviceId)) {
      return reply.status(400).send({ error: 'Device is offline' });
    }

    const orch = new VlmOrchestrator(vlmApiUrl, modelName || vlmModelName);

    // Wire up: when orchestrator decides an action, send it to the device
    orch.onAction = (action: VLMAction) => {
      wsHub.sendToDevice(deviceId, commandFromAction(action));
    };

    orch.onComplete = (result) => {
      activeTasks.delete(deviceId);
      completedTasks.set(result.episodeId, result);
    };

    orch.start({ deviceId, task, modelName, maxSteps, lang });

    activeTasks.set(deviceId, orch);

    // Request first screenshot from device to kick off the loop
    wsHub.sendToDevice(deviceId, { type: 'screenshot' });

    return {
      episodeId: orch['episodeId'],
      status: 'running',
      modelName: orch['client']?.getModelName() || vlmModelName,
    };
  });

  // ── POST /vlm/stop/:deviceId — Stop a running VLM task ──
  app.post('/api/v1/vlm/stop/:deviceId', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const orch = activeTasks.get(deviceId);
    if (!orch) return reply.status(404).send({ error: 'No active VLM task for this device' });
    await orch.stop();
    return { status: 'stopped' };
  });

  // ── GET /vlm/episodes — List all episodes (filesystem-backed) ──
  app.get('/api/v1/vlm/episodes', async () => {
    // Check in-memory completed tasks first, then fall back to filesystem
    const inMemory = Array.from(completedTasks.values()).map(r => ({
      episodeId: r.episodeId,
      deviceId: '',
      modelName: '',
      taskPrompt: '',
      startedAt: '',
      finishedAt: new Date().toISOString(),
      status: r.status,
      totalSteps: r.totalSteps,
      totalDurationMs: r.totalDurationMs,
      screenshotCount: r.steps.filter(s => s.screenshotBase64).length,
      fileSizeBytes: 0,
      source: 'in-memory' as const,
    }));

    // Read from filesystem
    const fromDisk: EpisodeSummary[] = EpisodeRecorder.listEpisodes();

    // Deduplicate: prefer in-memory (newer) over disk
    const inMemoryIds = new Set(inMemory.map(e => e.episodeId));
    const diskFiltered = fromDisk.filter(e => !inMemoryIds.has(e.episodeId));
    const diskWithSource = diskFiltered.map(e => ({ ...e, source: 'disk' as const }));

    // Also enrich disk episodes with active/completed data from in-memory if relevant
    return [...inMemory, ...diskWithSource];
  });

  // ── GET /vlm/episodes/:id — Episode detail with steps ──
  app.get('/api/v1/vlm/episodes/:id', async (req, reply) => {
    const episodeId = (req.params as Record<string, string>).id;

    // Check in-memory completed tasks first
    const inMemory = completedTasks.get(episodeId);
    if (inMemory) {
      const screenshotCount = inMemory.steps.filter(s => s.screenshotBase64).length;
      return { ...inMemory, screenshotCount, source: 'in-memory' };
    }

    // Fall back to filesystem
    const episode = EpisodeRecorder.loadEpisode(episodeId);
    if (!episode) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const ssCount = screenshotStore.count(episodeId);
    return { ...episode, screenshotCount: ssCount, source: 'disk' };
  });

  // ── POST /vlm/episodes/:id/compile — Compile episode to DeekeScript ──
  app.post('/api/v1/vlm/episodes/:id/compile', async (req, reply) => {
    const episodeId = (req.params as Record<string, string>).id;
    const body = req.body as {
      scriptName?: string;
      platform?: string;
      nodeSelectors?: Record<number, NodeSelector>;
      status?: 'draft' | 'active';
    };

    // Load episode from in-memory or disk
    let steps: EpisodeStep[];
    let taskPrompt = 'VLM Task';

    const inMemory = completedTasks.get(episodeId);
    if (inMemory) {
      steps = inMemory.steps.map(s => ({
        step: s.stepNumber,
        modelOutput: s.thinking,
        action: s.action as unknown as Record<string, unknown>,
        finished: s.finished,
      }));
      taskPrompt = episodeId;
    } else {
      const episode = EpisodeRecorder.loadEpisode(episodeId);
      if (!episode) {
        return reply.status(404).send({ error: 'Episode not found' });
      }
      steps = episode.steps;
      taskPrompt = episode.meta.taskPrompt || episodeId;
    }

    if (steps.length === 0) {
      return reply.status(400).send({ error: 'Episode has no steps to compile' });
    }

    // Convert EpisodeStep[] to StepResult[] for the compiler
    const stepResults: StepResult[] = steps.map(s => {
      const action = s.action as unknown as VLMAction;
      return {
        success: true,
        finished: s.finished,
        action: action.type ? action : { type: 'tap', x: 540, y: 1200 },
        thinking: s.modelOutput || '',
        stepNumber: s.step,
        durationMs: 0,
      };
    });

    // Build nodeSelectors map if provided
    let nodeSelectorsMap: Map<number, NodeSelector> | undefined;
    if (body.nodeSelectors) {
      nodeSelectorsMap = new Map();
      for (const [key, sel] of Object.entries(body.nodeSelectors)) {
        nodeSelectorsMap.set(parseInt(key, 10), sel);
      }
    }

    const scriptName = body.scriptName || `compiled-${episodeId}`;
    const platform = body.platform || detectPlatform(taskPrompt);

    // Compile
    const compiled: CompiledScript = compileEpisode(
      stepResults,
      scriptName,
      platform,
      nodeSelectorsMap,
    );

    // Store in in-memory scripts store
    const scriptId = randomUUID();
    const stored: StoredScript = {
      id: scriptId,
      episodeId,
      name: compiled.name,
      platform: compiled.platform,
      sourceCode: compiled.sourceCode,
      selectorCount: compiled.selectorCount,
      totalSteps: compiled.totalSteps,
      compiledAt: new Date().toISOString(),
      status: body.status || 'draft',
    };
    compiledScripts.set(scriptId, stored);

    // Also write to disk alongside the episode
    try {
      const traceDir = config.VLM_TRACE_DIR;
      const episodeDir = path.join(traceDir, episodeId);
      const compiledDir = path.join(episodeDir, 'compiled');
      fs.mkdirSync(compiledDir, { recursive: true });
      const scriptFile = path.join(compiledDir, `${scriptName}.js`);
      fs.writeFileSync(scriptFile, compiled.sourceCode, 'utf-8');
      const metaFile = path.join(compiledDir, 'metadata.json');
      fs.writeFileSync(metaFile, JSON.stringify(stored, null, 2), 'utf-8');
    } catch {
      // Non-critical: in-memory store already has it
    }

    return {
      script: stored,
      compiled,
    };
  });

  // ── DELETE /vlm/episodes/:id — Delete an episode ──
  app.delete('/api/v1/vlm/episodes/:id', async (req, reply) => {
    const episodeId = (req.params as Record<string, string>).id;

    // Remove from in-memory stores
    completedTasks.delete(episodeId);

    // Remove any compiled scripts associated with this episode
    for (const [id, script] of compiledScripts) {
      if (script.episodeId === episodeId) {
        compiledScripts.delete(id);
      }
    }

    // Delete from filesystem
    const deleted = EpisodeRecorder.deleteEpisode(episodeId);
    screenshotStore.deleteAll(episodeId);

    if (!deleted) {
      // Could be in-memory only (never written to disk), that's OK
      return { success: true, message: 'Episode removed from in-memory store (no disk copy found)' };
    }

    return { success: true, message: 'Episode deleted' };
  });

  // ── GET /vlm/scripts — List compiled scripts ──
  app.get('/api/v1/vlm/scripts', async () => {
    const scripts = Array.from(compiledScripts.values()).map(s => ({
      id: s.id,
      episodeId: s.episodeId,
      name: s.name,
      platform: s.platform,
      selectorCount: s.selectorCount,
      totalSteps: s.totalSteps,
      status: s.status,
      compiledAt: s.compiledAt,
    }));

    scripts.sort((a, b) => b.compiledAt.localeCompare(a.compiledAt));
    return { scripts };
  });

  // ── GET /vlm/scripts/:id — Get full script source code ──
  app.get('/api/v1/vlm/scripts/:id', async (req, reply) => {
    const scriptId = (req.params as Record<string, string>).id;
    const script = compiledScripts.get(scriptId);
    if (!script) {
      return reply.status(404).send({ error: 'Script not found' });
    }
    return script;
  });

  // ── DELETE /vlm/scripts/:id — Delete a compiled script ──
  app.delete('/api/v1/vlm/scripts/:id', async (req, reply) => {
    const scriptId = (req.params as Record<string, string>).id;
    const script = compiledScripts.get(scriptId);
    if (!script) {
      return reply.status(404).send({ error: 'Script not found' });
    }

    // Delete from disk if exists
    try {
      const traceDir = config.VLM_TRACE_DIR;
      const compiledDir = path.join(traceDir, script.episodeId, 'compiled');
      if (fs.existsSync(compiledDir)) {
        const files = fs.readdirSync(compiledDir);
        for (const file of files) {
          if (file.startsWith(script.name)) {
            fs.unlinkSync(path.join(compiledDir, file));
          }
        }
        // Remove metadata.json if present
        const metaFile = path.join(compiledDir, 'metadata.json');
        if (fs.existsSync(metaFile)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
            if (meta.id === scriptId) fs.unlinkSync(metaFile);
          } catch { /* skip */ }
        }
      }
    } catch {
      // Non-critical
    }

    compiledScripts.delete(scriptId);
    return { success: true, message: 'Script deleted' };
  });
}

/**
 * Detect platform from task prompt text.
 * Heuristic: look for platform keywords in Chinese/English.
 */
function detectPlatform(task: string): string {
  const lower = task.toLowerCase();
  if (lower.includes('douyin') || lower.includes('抖音') || lower.includes('dy')) return 'dy';
  if (lower.includes('kuaishou') || lower.includes('快手') || lower.includes('ks')) return 'ks';
  if (lower.includes('wechat') || lower.includes('微信') || lower.includes('视频号') || lower.includes('wx')) return 'wx';
  if (lower.includes('xiaohongshu') || lower.includes('小红书') || lower.includes('rednote') || lower.includes('xhs')) return 'xhs';
  return 'dy'; // Default to Douyin
}

/**
 * Convert VLM action to a device command message.
 * These commands match remote-bridge.js's executeCommand() switch cases.
 */
export function commandFromAction(action: VLMAction): object {
  switch (action.type) {
    case 'tap':
      return { type: 'command', action: 'tap', params: { x: action.x, y: action.y } };
    case 'long_press':
      return { type: 'command', action: 'tap', params: { x: action.x, y: action.y, duration: 800 } };
    case 'swipe':
      return { type: 'command', action: 'swipe', params: { x1: action.x, y1: action.y, x2: action.x2, y2: action.y2 } };
    case 'type':
      return { type: 'command', action: 'type', params: { text: action.text } };
    case 'back':
      return { type: 'command', action: 'back', params: {} };
    case 'home':
      return { type: 'command', action: 'home', params: {} };
    case 'launch':
      return { type: 'command', action: 'launch', params: { package: action.package } };
    case 'terminate':
    case 'answer':
      return { type: 'stop_task', task_id: 'vlm-task' };
    default:
      return { type: 'command', action: 'tap', params: { x: 540, y: 1200 } };
  }
}

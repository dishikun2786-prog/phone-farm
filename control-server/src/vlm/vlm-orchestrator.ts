/**
 * VLM Orchestrator — Main control loop for AI-driven phone automation.
 *
 * Coordinates: screenshot → VLM call → action parsing → device command → repeat.
 * Reuses existing phone commands via WebSocket hub — no remote-bridge.js changes needed.
 *
 * Architecture:
 *   1. Phone sends screenshot to server (existing WS message)
 *   2. Orchestrator sends screenshot to Python VLM Bridge
 *   3. VLM returns action (tap/swipe/type/back/home/launch/terminate)
 *   4. Orchestrator sends command to phone via existing WS command channel
 *   5. Phone executes and sends new screenshot
 *   6. Loop until VLM returns terminate or max_steps reached
 */

import { VlmClient, type VLMResponse, type VLMAction } from './vlm-client';
import { parseAction } from './action-parser';
import { EpisodeRecorder } from './episode-recorder';

export interface VlmTaskConfig {
  deviceId: string;
  task: string;
  modelName?: string;
  maxSteps?: number;
  lang?: string;
  traceEnabled?: boolean;
}

export interface StepResult {
  success: boolean;
  finished: boolean;
  action: VLMAction;
  thinking: string;
  stepNumber: number;
  screenshotBase64?: string;
  durationMs: number;
  error?: string;
}

export interface VlmTaskResult {
  episodeId: string;
  status: 'completed' | 'failed' | 'stopped' | 'max_steps';
  steps: StepResult[];
  totalSteps: number;
  totalDurationMs: number;
  message: string;
}

/**
 * VlmOrchestrator runs the VLM decision loop for a single device.
 * It expects an external driver to provide screenshots and execute commands.
 *
 * Usage pattern (event-driven):
 *   const orch = new VlmOrchestrator();
 *   orch.start(task, deviceId);
 *   // On each screenshot from device:
 *   orch.onScreenshot(base64, width, height, currentApp);
 *   // Orchestrator calls back with the action to execute
 */
export class VlmOrchestrator {
  private client: VlmClient;
  private recorder: EpisodeRecorder | null = null;
  private config: VlmTaskConfig | null = null;
  private stepCount = 0;
  private steps: StepResult[] = [];
  private episodeId = '';
  private history: Array<{ screenshot?: string; action?: Record<string, unknown> }> = [];
  private running = false;

  /** Callback when an action should be executed on the device */
  onAction: ((action: VLMAction, step: StepResult) => void) | null = null;

  /** Callback when the task is complete */
  onComplete: ((result: VlmTaskResult) => void) | null = null;

  constructor(vlmApiUrl?: string, modelName?: string) {
    this.client = new VlmClient(vlmApiUrl, modelName);
  }

  get isRunning(): boolean { return this.running; }
  get stepNumber(): number { return this.stepCount; }

  /**
   * Start a new VLM task. Will request the first screenshot from the device.
   */
  start(config: VlmTaskConfig): void {
    this.config = {
      maxSteps: 50,
      lang: 'cn',
      traceEnabled: true,
      ...config,
    };
    if (config.modelName) {
      this.client = new VlmClient(undefined, config.modelName);
    }

    this.stepCount = 0;
    this.steps = [];
    this.history = [];
    this.running = true;
    this.episodeId = `vlm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (this.config.traceEnabled) {
      this.recorder = new EpisodeRecorder(this.episodeId, this.config.task);
      this.recorder.startEpisode(this.config.deviceId, this.client.getModelName());
    }
  }

  /**
   * Process a screenshot from the device. This is the core loop iteration.
   * Called whenever a device sends a screenshot during a VLM task.
   */
  async onScreenshot(
    base64: string,
    width: number,
    height: number,
    currentApp: string,
  ): Promise<StepResult> {
    if (!this.running || !this.config) {
      throw new Error('Orchestrator not running. Call start() first.');
    }

    const t0 = Date.now();

    try {
      const response: VLMResponse = await this.client.executeStep({
        task: this.config.task,
        screenshot: { base64, width, height },
        history: this.history,
        currentApp,
        lang: this.config.lang || 'cn',
        stepNumber: this.stepCount,
      });

      const modelType = this.client.getModelType();
      const parsed = parseAction(response.rawContent, modelType, { width, height });

      const elapsed = Date.now() - t0;
      const step: StepResult = {
        success: true,
        finished: parsed.finished,
        action: parsed.action,
        thinking: parsed.thinking,
        stepNumber: this.stepCount,
        screenshotBase64: base64,
        durationMs: elapsed,
      };

      this.stepCount++;
      this.steps.push(step);
      this.history.push({ screenshot: base64, action: parsed.action as unknown as Record<string, unknown> });

      // Trim history to last 5 steps to manage context window
      if (this.history.length > 10) {
        this.history = this.history.slice(-10);
      }

      // Record the step
      this.recorder?.recordStep(
        this.stepCount,
        base64,
        response.rawContent,
        parsed.action as unknown as Record<string, unknown>,
        parsed.finished,
      );

      // Check termination conditions
      if (parsed.finished) {
        await this.finish('completed', parsed.action.message || 'Task completed');
      } else if (this.stepCount >= (this.config.maxSteps || 50)) {
        await this.finish('max_steps', `Reached max steps (${this.config.maxSteps})`);
      }

      // Notify action callback
      this.onAction?.(parsed.action, step);

      return step;
    } catch (err) {
      const elapsed = Date.now() - t0;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const step: StepResult = {
        success: false,
        finished: false,
        action: { type: 'tap', x: width / 2, y: height / 2 },
        thinking: '',
        stepNumber: this.stepCount,
        screenshotBase64: base64,
        durationMs: elapsed,
        error: errorMsg,
      };
      this.steps.push(step);
      return step;
    }
  }

  /**
   * Stop the task prematurely.
   */
  async stop(): Promise<void> {
    await this.finish('stopped', 'Stopped by user');
  }

  private async finish(status: VlmTaskResult['status'], message: string): Promise<void> {
    this.running = false;
    const result: VlmTaskResult = {
      episodeId: this.episodeId,
      status,
      steps: [...this.steps],
      totalSteps: this.steps.length,
      totalDurationMs: this.steps.reduce((sum, s) => sum + s.durationMs, 0),
      message,
    };

    this.recorder?.endEpisode(status, result);
    this.onComplete?.(result);
  }
}

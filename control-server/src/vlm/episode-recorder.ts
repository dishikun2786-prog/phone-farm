/**
 * Episode Recorder — Records full VLM task execution as structured episodes.
 *
 * Directory layout (mirrors ClawGUI's GUITracer):
 *   <trace_dir>/
 *     <episode_id>/
 *       episode.json
 *       images/
 *         step0.png
 *         step1.png
 *         ...
 *
 * episode.json format:
 *   {
 *     "episodeId": "...",
 *     "deviceId": "...",
 *     "modelName": "...",
 *     "taskPrompt": "...",
 *     "startedAt": "...",
 *     "finishedAt": "...",
 *     "status": "completed|failed|stopped|max_steps",
 *     "totalSteps": 10,
 *     "totalDurationMs": 45000,
 *     "steps": [
 *       {"step": 0, "modelOutput": "...", "action": {...}, "finished": false},
 *       ...
 *     ]
 *   }
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface EpisodeMeta {
  episodeId: string;
  deviceId: string;
  modelName: string;
  taskPrompt: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  totalSteps: number;
  totalDurationMs: number;
}

export interface EpisodeStep {
  step: number;
  modelOutput: string;
  action: Record<string, unknown>;
  finished: boolean;
}

export interface EpisodeData {
  meta: EpisodeMeta;
  steps: EpisodeStep[];
}

/** Summary returned by listEpisodes (subset of EpisodeMeta + computed fields) */
export interface EpisodeSummary {
  episodeId: string;
  deviceId: string;
  modelName: string;
  taskPrompt: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  totalSteps: number;
  totalDurationMs: number;
  screenshotCount: number;
  fileSizeBytes: number;
}

/**
 * DB-like persistence interface for episode storage.
 * FileSystemStore implements this for disk; a DrizzleStore would implement it for PostgreSQL.
 */
export interface EpisodeStore {
  saveEpisode(episode: EpisodeData): Promise<void>;
  loadEpisode(episodeId: string): Promise<EpisodeData | null>;
  listEpisodes(): Promise<EpisodeSummary[]>;
  deleteEpisode(episodeId: string): Promise<boolean>;
}

/**
 * File-system backed EpisodeStore.
 * Reads/writes episode.json files inside <traceDir>/<episodeId>/.
 */
export class FileSystemEpisodeStore implements EpisodeStore {
  private traceDir: string;

  constructor(traceDir?: string) {
    this.traceDir = traceDir || config.VLM_TRACE_DIR;
  }

  async saveEpisode(episode: EpisodeData): Promise<void> {
    const episodeDir = path.join(this.traceDir, episode.meta.episodeId);
    fs.mkdirSync(episodeDir, { recursive: true });
    const episodePath = path.join(episodeDir, 'episode.json');
    fs.writeFileSync(episodePath, JSON.stringify(episode, null, 2), 'utf-8');
  }

  async loadEpisode(episodeId: string): Promise<EpisodeData | null> {
    return EpisodeRecorder.loadEpisode(episodeId, this.traceDir);
  }

  async listEpisodes(): Promise<EpisodeSummary[]> {
    return EpisodeRecorder.listEpisodes(this.traceDir);
  }

  async deleteEpisode(episodeId: string): Promise<boolean> {
    const episodeDir = path.join(this.traceDir, episodeId);
    if (!fs.existsSync(episodeDir)) return false;
    fs.rmSync(episodeDir, { recursive: true, force: true });
    return true;
  }
}

export class EpisodeRecorder {
  private episodeId: string;
  private taskPrompt: string;
  private deviceId = '';
  private modelName = '';
  private startedAt = '';
  private episodeDir = '';
  private imagesDir = '';
  private steps: EpisodeStep[] = [];
  private traceDir: string;
  private store: EpisodeStore | null = null;

  constructor(episodeId: string, taskPrompt: string, traceDir?: string) {
    this.episodeId = episodeId;
    this.taskPrompt = taskPrompt;
    this.traceDir = traceDir || config.VLM_TRACE_DIR;
  }

  /** Attach a DB-like store for dual-write persistence. */
  setStore(store: EpisodeStore): void {
    this.store = store;
  }

  startEpisode(deviceId: string, modelName: string): void {
    this.deviceId = deviceId;
    this.modelName = modelName;
    this.startedAt = new Date().toISOString();
    this.steps = [];

    this.episodeDir = path.join(this.traceDir, this.episodeId);
    this.imagesDir = path.join(this.episodeDir, 'images');
    fs.mkdirSync(this.imagesDir, { recursive: true });
  }

  recordStep(
    stepNumber: number,
    screenshotBase64: string,
    modelRawOutput: string,
    action: Record<string, unknown>,
    finished: boolean,
  ): void {
    this.saveScreenshot(stepNumber, screenshotBase64);
    this.steps.push({
      step: stepNumber,
      modelOutput: modelRawOutput,
      action,
      finished,
    });
  }

  endEpisode(status: string, result: { totalSteps: number; totalDurationMs: number }): void {
    const episode: EpisodeData = {
      meta: {
        episodeId: this.episodeId,
        deviceId: this.deviceId,
        modelName: this.modelName,
        taskPrompt: this.taskPrompt,
        startedAt: this.startedAt,
        finishedAt: new Date().toISOString(),
        status,
        totalSteps: result.totalSteps,
        totalDurationMs: result.totalDurationMs,
      },
      steps: this.steps,
    };

    // Write to disk
    try {
      const episodePath = path.join(this.episodeDir, 'episode.json');
      fs.writeFileSync(episodePath, JSON.stringify(episode, null, 2), 'utf-8');
    } catch {
      // Non-critical: episode data already in DB
    }

    // Write to DB store if attached
    if (this.store) {
      this.store.saveEpisode(episode).catch(() => {
        // Non-critical: disk copy already saved
      });
    }
  }

  /**
   * Persist the episode metadata and steps to a DB-like store.
   * Called externally after endEpisode, or used standalone for DB-only saves.
   */
  async saveToDb(store: EpisodeStore): Promise<void> {
    const meta: EpisodeMeta = {
      episodeId: this.episodeId,
      deviceId: this.deviceId,
      modelName: this.modelName,
      taskPrompt: this.taskPrompt,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      status: 'completed',
      totalSteps: this.steps.length,
      totalDurationMs: 0,
    };

    const episode: EpisodeData = { meta, steps: this.steps };
    await store.saveEpisode(episode);
  }

  /** Read a single episode from disk by episodeId. */
  static loadEpisode(episodeId: string, traceDir?: string): EpisodeData | null {
    const dir = traceDir || config.VLM_TRACE_DIR;
    const episodePath = path.join(dir, episodeId, 'episode.json');
    try {
      const raw = fs.readFileSync(episodePath, 'utf-8');
      return JSON.parse(raw) as EpisodeData;
    } catch {
      return null;
    }
  }

  /** List all episodes in the trace directory with summary metadata. */
  static listEpisodes(traceDir?: string): EpisodeSummary[] {
    const dir = traceDir || config.VLM_TRACE_DIR;
    const results: EpisodeSummary[] = [];

    try {
      if (!fs.existsSync(dir)) return results;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const episodeDir = path.join(dir, entry.name);
        const episodeFile = path.join(episodeDir, 'episode.json');
        if (!fs.existsSync(episodeFile)) continue;

        try {
          const raw = fs.readFileSync(episodeFile, 'utf-8');
          const data = JSON.parse(raw) as EpisodeData;
          const imagesDir = path.join(episodeDir, 'images');

          let screenshotCount = 0;
          let fileSizeBytes = Buffer.byteLength(raw, 'utf-8');

          if (fs.existsSync(imagesDir)) {
            screenshotCount = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png')).length;
            for (const img of fs.readdirSync(imagesDir)) {
              try {
                fileSizeBytes += fs.statSync(path.join(imagesDir, img)).size;
              } catch { /* skip stat errors */ }
            }
          }

          results.push({
            episodeId: data.meta.episodeId,
            deviceId: data.meta.deviceId,
            modelName: data.meta.modelName,
            taskPrompt: data.meta.taskPrompt,
            startedAt: data.meta.startedAt,
            finishedAt: data.meta.finishedAt,
            status: data.meta.status,
            totalSteps: data.meta.totalSteps,
            totalDurationMs: data.meta.totalDurationMs,
            screenshotCount,
            fileSizeBytes,
          });
        } catch {
          // Skip corrupted episode directories
        }
      }
    } catch {
      // Trace directory doesn't exist or is inaccessible
    }

    // Most recent first
    results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return results;
  }

  /** Delete an episode directory from disk. */
  static deleteEpisode(episodeId: string, traceDir?: string): boolean {
    const dir = traceDir || config.VLM_TRACE_DIR;
    const episodeDir = path.join(dir, episodeId);
    if (!fs.existsSync(episodeDir)) return false;
    fs.rmSync(episodeDir, { recursive: true, force: true });
    return true;
  }

  // ── Accessors used by vlm-routes ──

  getEpisodeId(): string {
    return this.episodeId;
  }

  getEpisodeDir(): string {
    return this.episodeDir;
  }

  getImagesDir(): string {
    return this.imagesDir;
  }

  getSteps(): EpisodeStep[] {
    return [...this.steps];
  }

  getTraceDir(): string {
    return this.traceDir;
  }

  private saveScreenshot(step: number, base64: string): string | null {
    try {
      const filePath = path.join(this.imagesDir, `step${step}.png`);
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      return filePath;
    } catch {
      return null;
    }
  }
}

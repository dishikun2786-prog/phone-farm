/**
 * Screenshot Store — Manages saving/loading screenshots for VLM episodes.
 *
 * Directory layout:
 *   data/screenshots/
 *     <episodeId>/
 *       step0.png
 *       step1.png
 *       ...
 *
 * Screenshots are stored as base64-decoded PNG files on disk.
 * This store is complementary to EpisodeRecorder's inline screenshot saving;
 * it provides a standalone API for screenshot CRUD operations.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface ScreenshotEntry {
  /** Step index (0-based) */
  stepIndex: number;
  /** Absolute path to the PNG file */
  filePath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** ISO timestamp when the file was written */
  savedAt: string;
}

export class ScreenshotStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(config.VLM_TRACE_DIR, '..', 'screenshots');
  }

  /**
   * Save a base64-encoded screenshot to disk.
   * @returns The absolute file path of the saved image.
   */
  save(episodeId: string, stepIndex: number, base64Data: string): string {
    const dir = this.episodeDir(episodeId);
    fs.mkdirSync(dir, { recursive: true });

    const fileName = `step${stepIndex}.png`;
    const filePath = path.join(dir, fileName);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    return filePath;
  }

  /**
   * Load a screenshot and return it as a base64 string.
   * Returns null if the file does not exist.
   */
  get(episodeId: string, stepIndex: number): string | null {
    const filePath = path.join(this.episodeDir(episodeId), `step${stepIndex}.png`);
    try {
      const buffer = fs.readFileSync(filePath);
      return buffer.toString('base64');
    } catch {
      return null;
    }
  }

  /**
   * List all screenshots for an episode.
   * Returns entries sorted by stepIndex ascending.
   */
  list(episodeId: string): ScreenshotEntry[] {
    const dir = this.episodeDir(episodeId);
    const results: ScreenshotEntry[] = [];

    try {
      if (!fs.existsSync(dir)) return results;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        const match = file.match(/^step(\d+)\.png$/);
        if (!match) continue;

        const stepIndex = parseInt(match[1], 10);
        const filePath = path.join(dir, file);
        let sizeBytes = 0;
        let savedAt = '';
        try {
          const stat = fs.statSync(filePath);
          sizeBytes = stat.size;
          savedAt = stat.mtime.toISOString();
        } catch {
          // File disappeared between readdir and stat; skip
          continue;
        }

        results.push({ stepIndex, filePath, sizeBytes, savedAt });
      }
    } catch {
      // Directory doesn't exist or is inaccessible
    }

    results.sort((a, b) => a.stepIndex - b.stepIndex);
    return results;
  }

  /**
   * Count screenshots for an episode without loading them.
   */
  count(episodeId: string): number {
    const dir = this.episodeDir(episodeId);
    try {
      if (!fs.existsSync(dir)) return 0;
      return fs.readdirSync(dir).filter(f => f.match(/^step\d+\.png$/)).length;
    } catch {
      return 0;
    }
  }

  /**
   * Delete all screenshots for an episode.
   */
  deleteAll(episodeId: string): boolean {
    const dir = this.episodeDir(episodeId);
    try {
      if (!fs.existsSync(dir)) return false;
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a single screenshot.
   */
  deleteOne(episodeId: string, stepIndex: number): boolean {
    const filePath = path.join(this.episodeDir(episodeId), `step${stepIndex}.png`);
    try {
      if (!fs.existsSync(filePath)) return false;
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Resolve the store directory for a given episode. */
  private episodeDir(episodeId: string): string {
    return path.join(this.baseDir, episodeId);
  }

  /** The base directory for all screenshot storage. */
  getBaseDir(): string {
    return this.baseDir;
  }
}

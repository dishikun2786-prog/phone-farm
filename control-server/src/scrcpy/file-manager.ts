/**
 * FileManager — ADB file push/pull/list/delete/install for connected devices.
 *
 * Uses the system `adb` binary via child_process.
 * All operations are asynchronous and non-blocking.
 */
import { execSync, spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileItem {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

export interface UploadProgress {
  deviceId: string;
  filename: string;
  progress: number;  // 0-100
  status: 'uploading' | 'completed' | 'failed';
  error?: string;
}

export type ProgressCallback = (progress: UploadProgress) => void;

type AdbTargetFn = (tailscaleIp: string) => string;

export class FileManager {
  private getAdbTarget: AdbTargetFn;
  private uploadsDir: string;

  constructor(getAdbTarget: AdbTargetFn) {
    this.getAdbTarget = getAdbTarget;
    this.uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private runAdb(tailscaleIp: string, args: string[], timeoutMs = 30000): string {
    const target = this.getAdbTarget(tailscaleIp);
    return execSync(`adb -s ${target} ${args.join(' ')}`, {
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  async listFiles(tailscaleIp: string, remotePath: string): Promise<FileItem[]> {
    const target = this.getAdbTarget(tailscaleIp);
    // Ensure connection
    try { execSync(`adb -s ${target} shell echo ok`, { timeout: 5000, stdio: 'ignore' }); } catch {
      execSync(`adb connect ${target}`, { timeout: 10000, stdio: 'ignore' });
    }

    const safePath = remotePath || '/sdcard/';
    const output = this.runAdb(tailscaleIp, [
      'shell', 'ls', '-la', `"${safePath}"`,
    ]);

    const lines = output.trim().split('\n');
    const items: FileItem[] = [];

    for (const line of lines) {
      // Skip total line and empty
      if (line.startsWith('total ') || !line.trim()) continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;

      const perms = parts[0]!;
      const size = parseInt(parts[4]!, 10) || 0;
      const name = parts.slice(5).join(' ');
      const isDir = perms.startsWith('d');

      if (name === '.' || name === '..') continue;

      items.push({
        name,
        path: `${safePath.replace(/\/$/, '')}/${name}`,
        size,
        isDirectory: isDir,
        modifiedAt: parts[5] ? `${parts[2]} ${parts[3]}` : '',
      });
    }

    return items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async deleteFile(tailscaleIp: string, remotePath: string): Promise<boolean> {
    const safePath = JSON.stringify(remotePath);
    this.runAdb(tailscaleIp, ['shell', 'rm', '-rf', safePath]);
    return true;
  }

  async installApk(tailscaleIp: string, localPath: string): Promise<{ success: boolean; output: string }> {
    try {
      const output = this.runAdb(tailscaleIp, ['install', '-r', `"${localPath}"`], 120000);
      return { success: output.includes('Success'), output };
    } catch (err: any) {
      return { success: false, output: err.stderr || err.message };
    }
  }

  async pushFile(
    tailscaleIp: string,
    localPath: string,
    remotePath: string,
    onProgress?: ProgressCallback,
  ): Promise<{ success: boolean; remotePath: string }> {
    return new Promise((resolve, reject) => {
      const target = this.getAdbTarget(tailscaleIp);
      const filename = path.basename(localPath);

      // Use adb push with progress parsing
      const proc = spawn('adb', ['-s', target, 'push', localPath, remotePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        stderr += text;
        // adb push writes progress to stderr: "[ 46%] /data/local/tmp/file.apk"
        const match = text.match(/\[(\d+)%\]/);
        if (match && onProgress) {
          onProgress({
            deviceId: target,
            filename,
            progress: parseInt(match[1]!, 10),
            status: 'uploading',
          });
        }
      });

      proc.on('error', (err) => {
        if (onProgress) {
          onProgress({ deviceId: target, filename, progress: 0, status: 'failed', error: err.message });
        }
        reject(err);
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          if (onProgress) {
            onProgress({ deviceId: target, filename, progress: 100, status: 'completed' });
          }
          resolve({ success: true, remotePath });
        } else {
          if (onProgress) {
            onProgress({ deviceId: target, filename, progress: 0, status: 'failed', error: stderr });
          }
          reject(new Error(`ADB push failed: ${stderr}`));
        }
      });
    });
  }

  async pullFile(tailscaleIp: string, remotePath: string, localDir?: string): Promise<string> {
    const filename = path.basename(remotePath);
    const destDir = localDir || this.uploadsDir;
    const localPath = path.join(destDir, filename);

    this.runAdb(tailscaleIp, ['pull', `"${remotePath}"`, `"${localPath}"`], 120000);
    return localPath;
  }
}

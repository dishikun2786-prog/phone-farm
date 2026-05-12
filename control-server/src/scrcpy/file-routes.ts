/**
 * File management REST routes — upload, list, delete, install, download files
 * on connected Android devices via ADB.
 */
import type { FastifyInstance } from 'fastify';
import { FileManager } from './file-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export function registerFileRoutes(
  app: FastifyInstance,
  fileManager: FileManager,
): void {
  // List files on device
  app.get('/api/v1/devices/:id/files/list', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { tailscaleIp, dir } = req.query as Record<string, string>;

    if (!tailscaleIp) {
      return reply.status(400).send({ error: 'tailscaleIp query parameter required' });
    }

    try {
      const files = await fileManager.listFiles(tailscaleIp, dir || '/sdcard/');
      return { files };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Upload file to device (base64-encoded JSON body)
  app.post('/api/v1/devices/:id/files/upload', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const body = req.body as { tailscaleIp?: string; remoteDir?: string; filename?: string; data?: string };

    const { tailscaleIp, remoteDir, filename, data } = body;
    if (!tailscaleIp || !filename || !data) {
      return reply.status(400).send({ error: 'tailscaleIp, filename, and data required' });
    }

    const destDir = remoteDir || '/sdcard/Download/';
    const tmpDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tmpPath = path.join(tmpDir, `${crypto.randomUUID()}-${filename}`);
    fs.writeFileSync(tmpPath, Buffer.from(data, 'base64'));

    try {
      const remotePath = `${destDir.replace(/\/$/, '')}/${filename}`;
      const result = await fileManager.pushFile(tailscaleIp, tmpPath, remotePath);
      fs.unlink(tmpPath, () => {});
      return result;
    } catch (err: any) {
      fs.unlink(tmpPath, () => {});
      return reply.status(500).send({ error: err.message });
    }
  });

  // Delete file on device
  app.delete('/api/v1/devices/:id/files/delete', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { tailscaleIp, filePath } = req.query as Record<string, string>;

    if (!tailscaleIp || !filePath) {
      return reply.status(400).send({ error: 'tailscaleIp and filePath query params required' });
    }

    try {
      await fileManager.deleteFile(tailscaleIp, filePath);
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Install APK
  app.post('/api/v1/devices/:id/files/install', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { tailscaleIp, filePath } = req.body as Record<string, string>;

    if (!tailscaleIp || !filePath) {
      return reply.status(400).send({ error: 'tailscaleIp and filePath required' });
    }

    try {
      const result = await fileManager.installApk(tailscaleIp, filePath);
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Chunked file upload (replaces base64 whole-file JSON encoding) ──
  const chunkSessions = new Map<string, {
    uploadId: string;
    deviceId: string;
    tailscaleIp: string;
    filename: string;
    remoteDir: string;
    totalChunks: number;
    chunkSize: number;
    totalSize: number;
    chunks: Map<number, Buffer>;
    createdAt: Date;
    lastActivity: Date;
  }>();

  // Clean up stale chunk sessions every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of chunkSessions) {
      if (now - session.lastActivity.getTime() > 600_000) { // 10 min timeout
        chunkSessions.delete(id);
      }
    }
  }, 300_000);

  // Initialize a chunked upload session
  app.post('/api/v1/devices/:id/files/upload/init', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const body = req.body as {
      tailscaleIp?: string; remoteDir?: string; filename?: string;
      totalSize?: number; chunkSize?: number;
    };
    const { tailscaleIp, remoteDir, filename, totalSize, chunkSize } = body;
    if (!tailscaleIp || !filename || !totalSize) {
      return reply.status(400).send({ error: 'tailscaleIp, filename, and totalSize required' });
    }

    const uploadId = crypto.randomUUID();
    const cs = chunkSize || 1024 * 1024; // default 1MB chunks
    const totalChunks = Math.ceil(totalSize / cs);
    const now = new Date();

    chunkSessions.set(uploadId, {
      uploadId, deviceId, tailscaleIp, filename,
      remoteDir: remoteDir || '/sdcard/Download/',
      totalChunks, chunkSize: cs, totalSize,
      chunks: new Map(),
      createdAt: now,
      lastActivity: now,
    });

    return { uploadId, chunkSize: cs, totalChunks };
  });

  // Upload a single chunk (binary body)
  app.post('/api/v1/devices/:id/files/upload/chunk', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { uploadid, chunk } = req.query as Record<string, string>;
    const chunkIndex = parseInt(chunk || '', 10);

    if (!uploadid || isNaN(chunkIndex)) {
      return reply.status(400).send({ error: 'uploadId and chunk query params required' });
    }

    const session = chunkSessions.get(uploadid);
    if (!session || session.deviceId !== deviceId) {
      return reply.status(404).send({ error: 'Upload session not found' });
    }

    session.lastActivity = new Date();

    const raw = req.body;
    if (!raw || (typeof raw === 'object' && Object.keys(raw).length === 0)) {
      return reply.status(400).send({ error: 'Chunk data required as binary body' });
    }

    // Fastify parses request body — for binary chunks we use raw body
    // Fall back to base64 in JSON for MVP compatibility
    const body = raw as Record<string, unknown>;
    const dataB64 = (body.data || body.chunkData) as string;
    if (!dataB64) {
      return reply.status(400).send({ error: 'Chunk data required (data field as base64)' });
    }

    const chunkBuf = Buffer.from(dataB64, 'base64');
    session.chunks.set(chunkIndex, chunkBuf);

    return { uploadId: uploadid, chunk: chunkIndex, received: chunkBuf.length, progress: session.chunks.size / session.totalChunks };
  });

  // Complete upload: assemble chunks and push to device
  app.post('/api/v1/devices/:id/files/upload/complete', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { uploadId } = (req.body || {}) as Record<string, string>;

    if (!uploadId) {
      return reply.status(400).send({ error: 'uploadId required' });
    }

    const session = chunkSessions.get(uploadId);
    if (!session || session.deviceId !== deviceId) {
      return reply.status(404).send({ error: 'Upload session not found' });
    }

    // Verify all chunks received
    if (session.chunks.size < session.totalChunks) {
      const missing: number[] = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.chunks.has(i)) missing.push(i);
      }
      return reply.status(400).send({
        error: `Missing ${missing.length} chunks`,
        missingChunks: missing.slice(0, 20), // limit response size
        receivedChunks: session.chunks.size,
        totalChunks: session.totalChunks,
      });
    }

    // Assemble file
    const tmpDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${uploadId}-${session.filename}`);

    const sortedChunks: Buffer[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      sortedChunks.push(session.chunks.get(i)!);
    }
    fs.writeFileSync(tmpPath, Buffer.concat(sortedChunks));

    try {
      const remotePath = `${session.remoteDir.replace(/\/$/, '')}/${session.filename}`;
      const result = await fileManager.pushFile(session.tailscaleIp, tmpPath, remotePath);
      fs.unlink(tmpPath, () => {});
      chunkSessions.delete(uploadId);
      return { ...result, uploadId };
    } catch (err: any) {
      fs.unlink(tmpPath, () => {});
      return reply.status(500).send({ error: err.message });
    }
  });

  // Get upload progress
  app.get('/api/v1/devices/:id/files/upload/progress', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { uploadId } = req.query as Record<string, string>;

    if (!uploadId) {
      return reply.status(400).send({ error: 'uploadId query param required' });
    }

    const session = chunkSessions.get(uploadId);
    if (!session || session.deviceId !== deviceId) {
      return reply.status(404).send({ error: 'Upload session not found' });
    }

    const missing: number[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.chunks.has(i)) missing.push(i);
    }

    return {
      uploadId,
      filename: session.filename,
      totalSize: session.totalSize,
      receivedChunks: session.chunks.size,
      totalChunks: session.totalChunks,
      missingChunks: missing.slice(0, 50),
      progress: session.chunks.size / session.totalChunks,
    };
  });

  // Pull/download file from device
  app.post('/api/v1/devices/:id/files/pull', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { tailscaleIp, filePath } = req.body as Record<string, string>;

    if (!tailscaleIp || !filePath) {
      return reply.status(400).send({ error: 'tailscaleIp and filePath required' });
    }

    try {
      const localPath = await fileManager.pullFile(tailscaleIp, filePath);
      const filename = path.basename(filePath);
      return reply.header('Content-Disposition', `attachment; filename="${filename}"`).send(fs.createReadStream(localPath));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}

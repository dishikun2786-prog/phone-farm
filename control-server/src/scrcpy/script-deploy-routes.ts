/**
 * Script deploy routes — OTA push of android-bridge scripts to remote devices.
 *
 * Dual-runtime support:
 *   - runtime="deeke" (default): loads from android-bridge/ (root)
 *   - runtime="autox": loads from android-bridge/autox-v7/
 *
 * Flow:
 *   1. Server reads scripts from android-bridge/ or android-bridge/autox-v7/
 *   2. Base64-encodes them → sends via WebSocket to device's remote-bridge.js
 *   3. Device writes files to /sdcard/DeekeScript/scripts/ or /sdcard/AutoX/scripts/
 *   4. On next task start, device prefers external scripts over bundled
 */
import type { FastifyInstance } from 'fastify';
import type { WsHubLike } from '../vlm/vlm-routes';
import * as fs from 'fs';
import * as path from 'path';

const SCRIPTS_DIR = path.resolve(process.cwd(), '..', 'android-bridge');
const AUTOX_SCRIPTS_DIR = path.join(SCRIPTS_DIR, 'autox-v7');

interface ScriptManifest {
  version: string;
  minDeekeVersion?: string;
  minAutoXVersion?: string;
  runtime?: string;
  description?: string;
  files: Record<string, { version: string; sha256: string; required: boolean; description?: string }>;
}

function getScriptsDir(runtime?: string): string {
  if (runtime === 'autox' && fs.existsSync(AUTOX_SCRIPTS_DIR)) {
    return AUTOX_SCRIPTS_DIR;
  }
  return SCRIPTS_DIR;
}

function loadManifest(runtime?: string): ScriptManifest | null {
  try {
    const dir = getScriptsDir(runtime);
    const raw = fs.readFileSync(path.join(dir, 'version.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function encodeFiles(runtime?: string): Record<string, string> {
  const dir = getScriptsDir(runtime);
  const manifest = loadManifest(runtime);
  if (!manifest) return {};

  const encoded: Record<string, string> = {};
  for (const filename of Object.keys(manifest.files)) {
    try {
      const filePath = path.join(dir, filename);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        encoded[filename] = content.toString('base64');
      }
    } catch { /* skip unreadable files */ }
  }
  return encoded;
}

export function registerScriptDeployRoutes(
  app: FastifyInstance,
  wsHub: WsHubLike,
): void {
  // Get local script version manifest
  // Query: ?runtime=autox to get the AutoX v7 manifest
  app.get('/api/v1/scripts/version', async (req) => {
    const query = req.query as Record<string, string> | undefined;
    const runtime = query?.runtime;
    const manifest = loadManifest(runtime);
    if (!manifest) {
      return { error: 'version.json not found in android-bridge/' + (runtime === 'autox' ? 'autox-v7/' : '') };
    }
    return {
      version: manifest.version,
      runtime: manifest.runtime || runtime || 'deeke',
      description: manifest.description,
      minDeekeVersion: manifest.minDeekeVersion,
      minAutoXVersion: manifest.minAutoXVersion,
      fileCount: Object.keys(manifest.files).length,
      files: manifest.files,
    };
  });

  // Request script version from a specific device
  app.get('/api/v1/scripts/version/:deviceId', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const sent = wsHub.sendToDevice(deviceId, { type: 'check_scripts' });
    if (!sent) {
      return reply.status(400).send({ error: 'Device is offline' });
    }
    return {
      status: 'requested',
      deviceId,
      message: 'Version check sent. Device will respond via WebSocket (script_versions message).',
    };
  });

  // Deploy scripts to a single device (via WebSocket)
  // Body: { runtime?: 'deeke' | 'autox' } — auto-detected from device if omitted
  app.post('/api/v1/scripts/deploy/:deviceId', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).deviceId;
    const body = (req.body || {}) as Record<string, unknown>;

    // Auto-detect runtime from device store if available
    const device = (wsHub as any).getDevice?.(deviceId);
    const runtime = (body.runtime as string) || device?.runtime || 'deeke';

    const manifest = loadManifest(runtime);
    if (!manifest) {
      return reply.status(500).send({ error: 'version.json not found in android-bridge/' + (runtime === 'autox' ? 'autox-v7/' : '') });
    }

    const files = encodeFiles(runtime);
    if (Object.keys(files).length === 0) {
      return reply.status(500).send({ error: 'No script files found to deploy' });
    }

    const sent = wsHub.sendToDevice(deviceId, {
      type: 'deploy_scripts',
      version: manifest.version,
      files,
      runtime,
    });

    if (!sent) {
      return reply.status(400).send({ error: 'Device is offline' });
    }

    return {
      status: 'deploying',
      deviceId,
      runtime,
      version: manifest.version,
      fileCount: Object.keys(files).length,
    };
  });

  // Deploy scripts to multiple devices
  app.post('/api/v1/scripts/deploy-batch', async (req, reply) => {
    const body = req.body as { deviceIds?: string[]; runtime?: string };
    const deviceIds = body.deviceIds || [];

    if (deviceIds.length === 0) {
      return reply.status(400).send({ error: 'deviceIds array required' });
    }

    // Use specified runtime or default to 'deeke'
    const runtime = body.runtime || 'deeke';

    const manifest = loadManifest(runtime);
    if (!manifest) {
      return reply.status(500).send({ error: 'version.json not found in android-bridge/' + (runtime === 'autox' ? 'autox-v7/' : '') });
    }

    const files = encodeFiles(runtime);
    if (Object.keys(files).length === 0) {
      return reply.status(500).send({ error: 'No script files found to deploy' });
    }

    const results: Record<string, { sent: boolean }> = {};
    let successCount = 0;
    let failCount = 0;

    for (const deviceId of deviceIds) {
      const sent = wsHub.sendToDevice(deviceId, {
        type: 'deploy_scripts',
        version: manifest.version,
        files,
        runtime,
      });
      results[deviceId] = { sent };
      if (sent) successCount++; else failCount++;
    }

    return {
      status: 'deploying',
      runtime,
      version: manifest.version,
      fileCount: Object.keys(files).length,
      targetCount: deviceIds.length,
      successCount,
      failCount,
      results,
    };
  });
}

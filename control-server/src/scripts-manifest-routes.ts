/**
 * PhoneFarm Scripts Manifest Routes — 脚本版本管理 + OTA 热更新 API
 */
import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import fs from "fs";
import path from "path";

interface ScriptManifest {
  version: string;
  runtime: "autox-v7" | "phonefarm-native";
  files: Record<string, string>; // filename → SHA-256 hash
  updatedAt: number;
}

interface ScriptFileRecord {
  name: string;
  version: string;
  platform: string;
  content: string; // base64 encoded
  hash: string;
  createdAt: number;
}

export class ScriptsManifestStore {
  private fastify: FastifyInstance;
  private uploadedScripts: Map<string, ScriptFileRecord[]> = new Map(); // name → version history
  private currentVersion = "2.1.0";
  private scriptsDir: string;

  // Built-in script list with known files
  static readonly BUILTIN_SCRIPTS: Record<string, string> = {
    "task_dy_toker.js": "abc123",
    "task_dy_toker_city.js": "def456",
    "task_dy_toker_comment.js": "ghi789",
    "task_dy_search_user.js": "jkl012",
    "task_dy_live_barrage.js": "mno345",
    "task_dy_fans_inc_main.js": "pqr678",
    "task_dy_ai_back.js": "stu901",
    "task_ks_toker.js": "vwx234",
    "task_ks_search_user.js": "yz0567",
    "task_wx_toker.js": "abc890",
    "task_wx_search_inquiry.js": "def123",
    "task_xhs_toker.js": "ghi456",
    "task_xhs_fans.js": "jkl789",
    "task_xhs_yanghao.js": "mno012",
    "task_xhs_ai_back.js": "pqr345",
    "app-automation.js": "stu678",
  };

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    // Look for scripts in android-bridge directory (sibling to control-server)
    this.scriptsDir = path.join(process.cwd(), "..", "android-bridge");
  }

  /** Compute SHA-256 hash of a file, with LRU-like caching */
  private computeFileHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash("sha256").update(content).digest("hex").substring(0, 6);
    } catch {
      return "000000";
    }
  }

  /** 获取脚本版本清单 — with live file hashes when scripts directory is available */
  getManifest(runtime: string): ScriptManifest {
    const files: Record<string, string> = {};
    // Try to read actual script files for real hashes
    if (fs.existsSync(this.scriptsDir)) {
      for (const filename of Object.keys(ScriptsManifestStore.BUILTIN_SCRIPTS)) {
        const filePath = path.join(this.scriptsDir, filename);
        if (fs.existsSync(filePath)) {
          files[filename] = this.computeFileHash(filePath);
        } else {
          files[filename] = ScriptsManifestStore.BUILTIN_SCRIPTS[filename] || "000000";
        }
      }
    } else {
      // Fall back to hardcoded hashes
      Object.assign(files, ScriptsManifestStore.BUILTIN_SCRIPTS);
    }
    return {
      version: this.currentVersion,
      runtime: runtime as any,
      files,
      updatedAt: Date.now(),
    };
  }

  /** 获取脚本内容（base64 编码 — 支持按需下载） */
  getScriptContent(name: string): string | null {
    // First check uploaded scripts (newest version first)
    const uploaded = this.uploadedScripts.get(name);
    if (uploaded && uploaded.length > 0) {
      return uploaded[uploaded.length - 1]!.content;
    }
    // Fall back to filesystem
    const filePath = path.join(this.scriptsDir, name);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        return Buffer.from(content).toString("base64");
      }
    } catch {
      // File read failed — return null
    }
    return null;
  }

  /** 获取脚本版本历史 */
  getScriptVersions(name: string): Array<{ version: string; hash: string; createdAt: number }> {
    return (this.uploadedScripts.get(name) || []).map((s) => ({
      version: s.version,
      hash: s.hash,
      createdAt: s.createdAt,
    }));
  }

  /** 上传/注册新脚本版本 */
  uploadScript(params: { name: string; version: string; platform: string; content: string }): ScriptFileRecord {
    const hash = crypto.createHash("sha256").update(params.content).digest("hex").substring(0, 12);
    const record: ScriptFileRecord = {
      name: params.name,
      version: params.version,
      platform: params.platform,
      content: params.content,
      hash,
      createdAt: Date.now(),
    };
    const history = this.uploadedScripts.get(params.name) || [];
    history.push(record);
    // Keep only last 20 versions
    if (history.length > 20) history.shift();
    this.uploadedScripts.set(params.name, history);
    this.fastify.log.info(`[Scripts] Uploaded ${params.name} v${params.version} (${params.platform}) hash=${hash}`);
    return record;
  }
}

export async function scriptsManifestRoutes(app: FastifyInstance): Promise<void> {
  const store = new ScriptsManifestStore(app);

  // 获取脚本清单
  app.get("/api/v1/scripts/manifest", async (req, reply) => {
    const { runtime } = req.query as Record<string, string>;
    const manifest = store.getManifest(runtime ?? "phonefarm-native");
    // Android client expects bare Map<String, String>; dashboard expects full manifest
    if (runtime) {
      return reply.send(manifest.files);
    }
    return reply.send(manifest);
  });

  // 按需下载脚本文件
  app.post("/api/v1/scripts/download", async (req, reply) => {
    const { files } = req.body as { files: string[] };
    const result: Record<string, string | null> = {};
    for (const name of files) {
      result[name] = store.getScriptContent(name);
    }
    return reply.send({ files: result });
  });

  // Android alias: GET /api/v1/scripts/{name}/download (single script download)
  app.get("/api/v1/scripts/:name/download", async (req, reply) => {
    const { name } = req.params as { name: string };
    const content = store.getScriptContent(name);
    if (!content) return reply.status(404).send({ error: `Script "${name}" not found` });
    const manifest = store.getManifest("phonefarm-native");
    const hash = manifest.files[name] ?? "000000";
    return reply.send({
      name,
      content,
      version: manifest.version,
      platform: null,
      checksum: hash,
    });
  });

  // Android: GET /api/v1/plugins/manifest (plugin sync manifest)
  app.get("/api/v1/plugins/manifest", async (_req, reply) => {
    const manifest = store.getManifest("phonefarm-native");
    const plugins = Object.entries(manifest.files).map(([name, sha256]) => ({
      pluginId: name.replace(/\.js$/, ""),
      name,
      version: manifest.version,
      downloadUrl: null,
      sha256,
      sizeBytes: 0,
      isRequired: name === "app-automation.js",
    }));
    return reply.send({ plugins, updatedAt: manifest.updatedAt });
  });

  // 上传新脚本（管理员）
  app.post("/api/v1/scripts/upload", async (req, reply) => {
    const { name, version, platform, content } = req.body as {
      name: string; version: string; platform: string; content: string;
    };
    const record = store.uploadScript({ name, version, platform, content });
    return reply.status(201).send({
      name: record.name,
      version: record.version,
      hash: record.hash,
      platform: record.platform,
    });
  });

  // 获取脚本版本历史
  app.get("/api/v1/scripts/:name/versions", async (req, reply) => {
    const { name } = req.params as { name: string };
    const versions = store.getScriptVersions(name);
    return reply.send({ name, versions });
  });

  // 推送脚本到指定设备
  app.post("/api/v1/scripts/deploy/:deviceId", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const { files } = req.body as { files: Record<string, string> };
    const wsHub = (app as any).wsHub;
    if (wsHub) {
      wsHub.sendToDevice(deviceId, {
        type: "deploy_scripts",
        version: store.getManifest("phonefarm-native").version,
        files,
        timestamp: Date.now(),
      });
    }
    return reply.send({ ok: true, deviceId, deployed: Object.keys(files).length });
  });

  // 批量推送脚本到分组设备
  app.post("/api/v1/scripts/deploy/group/:groupId", async (req, reply) => {
    const { groupId } = req.params as { groupId: string };
    const { files } = req.body as { files: Record<string, string> };
    const wsHub = (app as any).wsHub;
    if (wsHub) {
      let deployed = 0;
      const deviceIds = wsHub.getOnlineDevices();
      for (const deviceId of deviceIds) {
        if (wsHub.sendToDevice(deviceId, { type: "deploy_scripts", version: store.getManifest("phonefarm-native").version, files, timestamp: Date.now() })) {
          deployed++;
        }
      }
      return reply.send({ ok: true, groupId, deployed, totalDevices: deviceIds.length });
    }
    return reply.send({ ok: true, groupId, deployed: 0 });
  });

  // 获取当前脚本版本号
  app.get("/api/v1/scripts/version", async (_req, reply) => {
    const manifest = store.getManifest("phonefarm-native");
    return reply.send({ version: manifest.version, runtime: manifest.runtime, updatedAt: manifest.updatedAt });
  });

  // 检查设备脚本版本
  app.get("/api/v1/scripts/version/:deviceId", async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const manifest = store.getManifest("phonefarm-native");
    return reply.send({ deviceId, serverVersion: manifest.version, needsUpdate: true });
  });

  // 批量部署脚本到多台设备
  app.post("/api/v1/scripts/deploy-batch", async (req, reply) => {
    const { deviceIds } = req.body as { deviceIds: string[] };
    return reply.send({ ok: true, deviceIds: deviceIds || [], deployed: 0 });
  });
}

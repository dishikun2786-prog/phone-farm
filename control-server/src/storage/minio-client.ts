/**
 * MinIO Client — Server-side S3-compatible object storage wrapper.
 *
 * Provides upload/download/listing for screenshots, AI models, and device logs
 * with lifecycle management (automatic cleanup based on retention policies).
 *
 * Uses the MinIO S3 REST API via AWS Signature V4 for authentication.
 * No external S3 SDK dependency — uses native fetch with manual signing.
 *
 * Lifecycle policies:
 *   - Screenshots: 7 days retention
 *   - Logs: 30 days retention
 *   - Models: keep latest 3 versions per model type
 */
import { createHash, randomUUID } from "crypto";
import { config } from "../config.js";
import type { RuntimeConfig } from "../config-manager/runtime-config.js";

// ── Types ──

export interface ModelVersion {
  version: string;
  size: number;
  uploadedAt: Date;
  sha256: string;
}

// ── MinIO Client Class ──

export class MinioClient {
  private endpoint: string;
  private accessKey: string;
  private secretKey: string;
  private bucket: string;
  private useSSL: boolean;
  private baseUrl: string;
  private initialized: boolean = false;
  private rc: RuntimeConfig | undefined;
  private screenshotsRetentionDays: number;
  private logsRetentionDays: number;
  private modelsKeepVersions: number;
  private defaultExpirySeconds: number;

  constructor(
    endpoint?: string,
    accessKey?: string,
    secretKey?: string,
    bucket?: string,
    rc?: RuntimeConfig,
  ) {
    this.rc = rc;
    this.endpoint = endpoint ?? config.MINIO_ENDPOINT;
    this.accessKey = accessKey ?? config.MINIO_ACCESS_KEY;
    this.secretKey = secretKey ?? config.MINIO_SECRET_KEY;
    this.bucket = bucket ?? config.MINIO_BUCKET;
    this.useSSL = config.MINIO_USE_SSL;
    this.screenshotsRetentionDays = rc?.getNumber("storage.screenshots.retention_days", 7) ?? 7;
    this.logsRetentionDays = rc?.getNumber("storage.logs.retention_days", 30) ?? 30;
    this.modelsKeepVersions = rc?.getNumber("storage.models.keep_versions", 3) ?? 3;
    this.defaultExpirySeconds = rc?.getNumber("storage.default_expiry_seconds", 3600) ?? 3600;

    const protocol = this.useSSL ? "https" : "http";
    this.baseUrl = `${protocol}://${this.endpoint}`;
  }

  /**
   * Initialize the MinIO client. Creates the bucket if it doesn't exist.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const exists = await this.bucketExists(this.bucket);
      if (!exists) {
        await this.createBucket(this.bucket);
        console.log(`[minio] Created bucket: ${this.bucket}`);
      }
      this.initialized = true;
      console.log(`[minio] Connected to ${this.baseUrl}, bucket: ${this.bucket}`);
    } catch (err) {
      console.error(`[minio] Initialization failed:`, err);
      throw err;
    }
  }

  // ── Screenshots ──

  /**
   * Upload a screenshot image for a device.
   */
  async uploadScreenshot(
    deviceId: string,
    data: Buffer,
    metadata?: Record<string, string>,
  ): Promise<string> {
    await this.initialize();

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileId = randomUUID();
    const ext = this.detectImageFormat(data) ?? "png";
    const key = `screenshots/${deviceId}/${dateStr}/${fileId}.${ext}`;

    const meta: Record<string, string> = {
      "X-Amz-Meta-Device-Id": deviceId,
      "X-Amz-Meta-Uploaded-At": new Date().toISOString(),
      ...metadata,
    };

    await this.putObject(key, data, this.getContentType(key), meta);

    return key;
  }

  /**
   * Retrieve a screenshot by its object key.
   */
  async getScreenshot(objectKey: string): Promise<Buffer> {
    await this.initialize();
    return this.getObject(objectKey);
  }

  // ── Models ──

  /**
   * Upload an AI model file to object storage.
   */
  async uploadModel(modelType: string, version: string, data: Buffer): Promise<string> {
    await this.initialize();

    const sha256 = createHash("sha256").update(data).digest("hex");
    const timestamp = Date.now();
    const key = `models/${modelType}/${version}-${timestamp}.bin`;

    const metadata: Record<string, string> = {
      "X-Amz-Meta-Model-Type": modelType,
      "X-Amz-Meta-Version": version,
      "X-Amz-Meta-Sha256": sha256,
      "X-Amz-Meta-Uploaded-At": new Date().toISOString(),
    };

    await this.putObject(key, data, "application/octet-stream", metadata);

    // Prune old versions to keep only the latest N
    await this.pruneOldModelVersions(modelType);

    return key;
  }

  /**
   * Download a model file by type and version.
   */
  async getModel(modelType: string, version: string): Promise<Buffer> {
    await this.initialize();

    const prefix = `models/${modelType}/${version}-`;
    const objects = await this.listObjects(prefix);

    if (objects.length === 0) {
      throw new Error(`Model not found: ${modelType}@${version}`);
    }

    // Sort by timestamp in key (newest first)
    objects.sort((a, b) => b.key.localeCompare(a.key));
    return this.getObject(objects[0]!.key);
  }

  /**
   * List available versions for a model type.
   */
  async listModels(modelType: string): Promise<ModelVersion[]> {
    await this.initialize();

    const prefix = `models/${modelType}/`;
    const objects = await this.listObjects(prefix);

    const versions: ModelVersion[] = [];

    for (const obj of objects) {
      const filename = obj.key.slice(prefix.length);
      const match = filename.match(/^(.+?)-(\d+)\.bin$/);
      if (!match) continue;

      versions.push({
        version: match[1]!,
        size: obj.size,
        uploadedAt: new Date(obj.lastModified),
        sha256: "",
      });
    }

    // Remove duplicates — keep newest timestamp per version
    const versionMap = new Map<string, ModelVersion>();
    for (const v of versions) {
      const existing = versionMap.get(v.version);
      if (!existing || v.uploadedAt > existing.uploadedAt) {
        versionMap.set(v.version, v);
      }
    }

    return Array.from(versionMap.values()).sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
    );
  }

  // ── Logs ──

  /**
   * Upload a device log chunk to object storage.
   */
  async uploadLogChunk(deviceId: string, date: string, data: Buffer): Promise<void> {
    await this.initialize();

    const chunkId = randomUUID();
    const key = `logs/${deviceId}/${date}/${chunkId}.log`;

    const metadata: Record<string, string> = {
      "X-Amz-Meta-Device-Id": deviceId,
      "X-Amz-Meta-Date": date,
      "X-Amz-Meta-Uploaded-At": new Date().toISOString(),
    };

    await this.putObject(key, data, "text/plain; charset=utf-8", metadata);
  }

  // ── Signed URLs ──

  /**
   * Generate a pre-signed URL for temporary direct access to an object.
   */
  async getSignedUrl(objectKey: string, expirySeconds: number = 0): Promise<string> {
    await this.initialize();
    const expSec = expirySeconds || this.defaultExpirySeconds;
    const expires = Math.floor(Date.now() / 1000) + expSec;
    const amzDate = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
    const dateStamp = amzDate.slice(0, 8);
    const region = "us-east-1";

    const credential = `${this.accessKey}/${dateStamp}/${region}/s3/aws4_request`;

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      `${dateStamp}/${region}/s3/aws4_request`,
      this.sha256Hex("UNSIGNED-PAYLOAD"),
    ].join("\n");

    const signature = await this.signString(stringToSign, dateStamp, region);

    const params = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": `${dateStamp}T000000Z`,
      "X-Amz-Expires": expSec.toString(),
      "X-Amz-SignedHeaders": "host",
      "X-Amz-Signature": signature,
    });

    return `${this.baseUrl}/${this.bucket}/${objectKey}?${params.toString()}`;
  }

  // ── Lifecycle Management ──

  /**
   * Delete all objects older than `days` under a given prefix.
   * Returns the count of deleted objects.
   */
  async deleteOlderThan(prefix: string, days: number): Promise<number> {
    await this.initialize();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const objects = await this.listObjects(prefix);
    let deleted = 0;

    for (const obj of objects) {
      const objDate = new Date(obj.lastModified);
      if (objDate < cutoff) {
        await this.deleteObject(obj.key);
        deleted++;
      }
    }

    console.log(`[minio] Deleted ${deleted} objects older than ${days} days under prefix "${prefix}"`);
    return deleted;
  }

  /**
   * Run full lifecycle cleanup:
   * - Screenshots: 7 days retention
   * - Logs: 30 days retention
   * - Models: keep latest 3 versions per model type
   */
  async runLifecycleCleanup(): Promise<{
    screenshotsDeleted: number;
    logsDeleted: number;
    modelsPruned: number;
  }> {
    await this.initialize();

    const screenshotsDeleted = await this.deleteOlderThan("screenshots/", this.screenshotsRetentionDays);
    const logsDeleted = await this.deleteOlderThan("logs/", this.logsRetentionDays);
    const modelsPruned = await this.pruneAllModelTypes();

    console.log(
      `[minio] Lifecycle cleanup: screenshots=${screenshotsDeleted}, logs=${logsDeleted}, models=${modelsPruned}`,
    );

    return { screenshotsDeleted, logsDeleted, modelsPruned };
  }

  // ── Health Check ──

  /**
   * Check if MinIO is reachable and the bucket is accessible.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/minio/health/live`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Graceful shutdown — cleanup resources.
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  get isReady(): boolean {
    return this.initialized;
  }

  // ── Private: Bucket Operations ──

  private async bucketExists(bucket: string): Promise<boolean> {
    try {
      const response = await this.signedRequest("HEAD", `/${bucket}`, undefined, {
        "Content-Length": "0",
      });
      return response.ok;
    } catch (err: any) {
      if (err?.message?.includes("NotFound") || err?.message?.includes("NoSuchBucket")) {
        return false;
      }
      throw err;
    }
  }

  private async createBucket(bucket: string): Promise<void> {
    await this.signedRequest("PUT", `/${bucket}`, undefined, {
      "Content-Length": "0",
      "x-amz-bucket-object-lock-enabled": "false",
    });
  }

  // ── Private: Object Operations ──

  private async putObject(
    key: string,
    data: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": data.length.toString(),
    };

    if (metadata) {
      Object.assign(headers, metadata);
    }

    const response = await this.signedRequest(
      "PUT",
      `/${this.bucket}/${encodeURIComponent(key)}`,
      data,
      headers,
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`MinIO putObject failed (${response.status}): ${body}`);
    }
  }

  private async getObject(key: string): Promise<Buffer> {
    const response = await this.signedRequest(
      "GET",
      `/${this.bucket}/${encodeURIComponent(key)}`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Object not found: ${key}`);
      }
      const body = await response.text();
      throw new Error(`MinIO getObject failed (${response.status}): ${body}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async deleteObject(key: string): Promise<void> {
    const response = await this.signedRequest(
      "DELETE",
      `/${this.bucket}/${encodeURIComponent(key)}`,
    );

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(`MinIO deleteObject failed (${response.status}): ${body}`);
    }
  }

  private async listObjects(prefix: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
    const params = new URLSearchParams({ prefix, "max-keys": "1000" });

    const response = await this.signedRequest(
      "GET",
      `/${this.bucket}?${params.toString()}`,
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`MinIO listObjects failed (${response.status}): ${body}`);
    }

    const xmlText = await response.text();
    return this.parseListObjectsXml(xmlText);
  }

  // ── Private: Model Pruning ──

  private async pruneOldModelVersions(modelType: string): Promise<number> {
    const versions = await this.listModels(modelType);
    if (versions.length <= this.modelsKeepVersions) return 0;

    const toDelete = versions.slice(this.modelsKeepVersions);
    let deleted = 0;

    for (const v of toDelete) {
      const prefix = `models/${modelType}/${v.version}-`;
      const objects = await this.listObjects(prefix);
      for (const obj of objects) {
        await this.deleteObject(obj.key);
        deleted++;
      }
    }

    return deleted;
  }

  private async pruneAllModelTypes(): Promise<number> {
    const objects = await this.listObjects("models/");
    const modelTypes = new Set<string>();

    for (const obj of objects) {
      const parts = obj.key.split("/");
      if (parts.length >= 2 && parts[1]) {
        modelTypes.add(parts[1]);
      }
    }

    let totalPruned = 0;
    for (const modelType of modelTypes) {
      totalPruned += await this.pruneOldModelVersions(modelType);
    }

    return totalPruned;
  }

  // ── Private: Helpers ──

  private detectImageFormat(data: Buffer): string | null {
    if (data.length < 4) return null;
    // PNG: 89 50 4E 47
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
    // JPEG: FF D8 FF
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
    // WebP: 52 49 46 46
    if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return "webp";
    return null;
  }

  private getContentType(key: string): string {
    const ext = key.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png": return "image/png";
      case "jpg": case "jpeg": return "image/jpeg";
      case "webp": return "image/webp";
      case "log": return "text/plain; charset=utf-8";
      case "bin": return "application/octet-stream";
      default: return "application/octet-stream";
    }
  }

  private parseListObjectsXml(xml: string): Array<{ key: string; size: number; lastModified: string }> {
    const results: Array<{ key: string; size: number; lastModified: string }> = [];
    const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    let match;

    while ((match = contentRegex.exec(xml)) !== null) {
      const content = match[1]!;
      const keyMatch = /<Key>(.*?)<\/Key>/.exec(content);
      const sizeMatch = /<Size>(\d+)<\/Size>/.exec(content);
      const dateMatch = /<LastModified>(.*?)<\/LastModified>/.exec(content);

      if (keyMatch) {
        results.push({
          key: keyMatch[1]!,
          size: sizeMatch ? parseInt(sizeMatch[1]!, 10) : 0,
          lastModified: dateMatch ? dateMatch[1]! : new Date().toISOString(),
        });
      }
    }

    return results;
  }

  // ── Private: AWS Signature V4 Signing ──

  private async signedRequest(
    method: string,
    resource: string,
    body?: Buffer | undefined,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const url = `${this.baseUrl}${resource}`;
    const host = new URL(url).host;
    const region = "us-east-1";
    const service = "s3";

    const amzDate = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
    const dateStamp = amzDate.slice(0, 8);

    const bodyHash = body ? this.sha256Hex(body) : this.sha256Hex("");
    if (body && !extraHeaders?.["Content-Length"]) {
      extraHeaders = { ...extraHeaders, "Content-Length": body.length.toString() };
    }

    const headers: Record<string, string> = {
      Host: host,
      "X-Amz-Date": amzDate,
      "X-Amz-Content-SHA256": bodyHash,
      ...extraHeaders,
    };

    const headerKeys = Object.keys(headers).filter((k) => headers[k] != null);
    const signedHeaders = headerKeys
      .map((k) => k.toLowerCase())
      .sort()
      .join(";");

    const canonicalHeaders = headerKeys
      .map((k) => k.toLowerCase())
      .sort()
      .map((k) => `${k}:${(headers[k] ?? "").trim()}`)
      .join("\n");

    const canonicalURI = resource.split("?")[0]!.split("/").map(encodeURIComponent).join("/");
    const canonicalQueryString = resource.includes("?") ? resource.split("?")[1]! : "";

    const canonicalRequest = [
      method.toUpperCase(),
      canonicalURI,
      canonicalQueryString,
      canonicalHeaders + "\n",
      signedHeaders,
      bodyHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join("\n");

    const signature = await this.signString(stringToSign, dateStamp, region);

    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    headers["Authorization"] = authorization;

    return fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
  }

  private async signString(stringToSign: string, dateStamp: string, region: string): Promise<string> {
    const encoder = new TextEncoder();

    const kSecret = encoder.encode("AWS4" + this.secretKey);
    const kDate = await this.hmacSha256(kSecret, dateStamp);
    const kRegion = await this.hmacSha256(kDate, region);
    const kService = await this.hmacSha256(kRegion, "s3");
    const kSigning = await this.hmacSha256(kService, "aws4_request");

    const signatureBuffer = await this.hmacSha256(kSigning, stringToSign);
    return Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
    return new Uint8Array(signature);
  }

  private sha256Hex(data: string | Buffer): string {
    const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
    return createHash("sha256").update(buffer).digest("hex");
  }
}

// ── Singleton ──

export let minioClient: MinioClient;

export function initMinioClient(): MinioClient {
  minioClient = new MinioClient();
  return minioClient;
}

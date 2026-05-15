import crypto from "crypto";
import { db } from "../db.js";
import { smsCodes } from "../schema.js";
import { eq, and, sql } from "drizzle-orm";
import { config } from "../config.js";

const ALIBABA_ENDPOINT = "dysmsapi.aliyuncs.com";
const API_VERSION = "2017-05-25";
const SIGNATURE_METHOD = "HMAC-SHA1";
const SIGNATURE_VERSION = "1.0";

// In-memory caches (migrate to Redis later)
const lastSendTime = new Map<string, number>();
const ipRequestCount = new Map<string, { count: number; resetAt: number }>();
const codeAttempts = new Map<string, { count: number; lockedUntil: number }>();

function cleanExpired() {
  const now = Date.now();
  for (const [key, v] of ipRequestCount) {
    if (now > v.resetAt) ipRequestCount.delete(key);
  }
  for (const [key, v] of codeAttempts) {
    if (now > v.lockedUntil) codeAttempts.delete(key);
  }
}

setInterval(cleanExpired, 60_000);

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/\+/g, "%20")
    .replace(/\~/g, "%7E");
}

function buildSignature(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  const canonicalized = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");
  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalized)}`;
  const hmac = crypto.createHmac("sha1", `${secret}&`);
  hmac.update(stringToSign);
  return hmac.digest("base64");
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export class SmsService {
  private accessKeyId: string;
  private accessKeySecret: string;
  private signName: string;
  private templateCode: string;

  constructor() {
    this.accessKeyId = config.ALIBABA_CLOUD_ACCESS_KEY_ID;
    this.accessKeySecret = config.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
    this.signName = config.SMS_SIGN_NAME;
    this.templateCode = config.SMS_TEMPLATE_CODE;
  }

  isConfigured(): boolean {
    return !!(this.accessKeyId && this.accessKeySecret);
  }

  async sendVerificationCode(
    phone: string,
    scene: string,
    clientIp: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: "SMS service not configured" };
    }

    // Rate limit: same phone 60s interval
    const lastTime = lastSendTime.get(phone);
    if (lastTime && Date.now() - lastTime < config.SMS_RATE_LIMIT_SEC * 1000) {
      const remaining = Math.ceil(
        (config.SMS_RATE_LIMIT_SEC * 1000 - (Date.now() - lastTime)) / 1000,
      );
      return {
        ok: false,
        error: `请等待 ${remaining} 秒后再试`,
      };
    }

    // IP rate limit: 10 per hour
    cleanExpired();
    const ipEntry = ipRequestCount.get(clientIp);
    if (ipEntry && ipEntry.count >= 10) {
      return { ok: false, error: "请求过于频繁，请稍后再试" };
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Clean up old codes for this phone+scene
    await db
      .delete(smsCodes)
      .where(
        and(eq(smsCodes.phone, phone), eq(smsCodes.scene, scene)),
      );

    // Store code in DB
    await db.insert(smsCodes).values({
      phone,
      code,
      scene,
      expiresAt,
      used: false,
    });

    // Update rate limits
    lastSendTime.set(phone, Date.now());
    if (!ipEntry || Date.now() > ipEntry.resetAt) {
      ipRequestCount.set(clientIp, {
        count: 1,
        resetAt: Date.now() + 3600_000,
      });
    } else {
      ipEntry.count++;
    }

    // Send SMS via Alibaba Cloud API
    try {
      await this.callSendSms(phone, code);
      console.log(
        `[sms] Code sent to ${phone} scene=${scene}`,
      );
      return { ok: true };
    } catch (err: any) {
      console.error("[sms] Send failed:", err.message || err);
      // For dev: still return ok so the flow can be tested without real SMS
      if (!config.ALIBABA_CLOUD_ACCESS_KEY_ID) {
        console.log(`[sms] DEV MODE — code for ${phone}: ${code}`);
        return { ok: true };
      }
      return { ok: false, error: "短信发送失败，请稍后再试" };
    }
  }

  async verifyCode(
    phone: string,
    code: string,
    scene: string,
  ): Promise<{ valid: boolean; error?: string }> {
    // Brute force protection
    const attemptKey = `${phone}:${scene}`;
    const attempts = codeAttempts.get(attemptKey);
    if (attempts && attempts.lockedUntil > Date.now()) {
      const minutes = Math.ceil(
        (attempts.lockedUntil - Date.now()) / 60_000,
      );
      return {
        valid: false,
        error: `验证码错误次数过多，请 ${minutes} 分钟后重试`,
      };
    }

    const [record] = await db
      .select()
      .from(smsCodes)
      .where(
        and(
          eq(smsCodes.phone, phone),
          eq(smsCodes.scene, scene),
          eq(smsCodes.used, false),
        ),
      )
      .orderBy(sql`${smsCodes.createdAt} DESC`)
      .limit(1);

    if (!record) {
      return { valid: false, error: "请先获取验证码" };
    }

    if (new Date(record.expiresAt) < new Date()) {
      return { valid: false, error: "验证码已过期，请重新获取" };
    }

    if (record.code !== code) {
      // Track failed attempts
      const current = codeAttempts.get(attemptKey) || {
        count: 0,
        lockedUntil: 0,
      };
      current.count++;
      if (current.count >= 5) {
        current.lockedUntil = Date.now() + 30 * 60_000;
        return {
          valid: false,
          error: "验证码错误次数过多，请 30 分钟后重试",
        };
      }
      codeAttempts.set(attemptKey, current);
      return {
        valid: false,
        error: `验证码错误，还剩 ${5 - current.count} 次机会`,
      };
    }

    // Mark as used
    await db
      .update(smsCodes)
      .set({ used: true })
      .where(eq(smsCodes.id, record.id));

    // Clear attempts on success
    codeAttempts.delete(attemptKey);

    return { valid: true };
  }

  private async callSendSms(
    phone: string,
    code: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(
      /\.\d{3}Z$/,
      "Z",
    );
    const nonce = crypto.randomUUID();

    const params: Record<string, string> = {
      AccessKeyId: this.accessKeyId,
      Action: "SendSms",
      Format: "JSON",
      PhoneNumbers: phone,
      SignName: this.signName,
      SignatureMethod: SIGNATURE_METHOD,
      SignatureNonce: nonce,
      SignatureVersion: SIGNATURE_VERSION,
      TemplateCode: this.templateCode,
      TemplateParam: JSON.stringify({ code }),
      Timestamp: timestamp,
      Version: API_VERSION,
    };

    params.Signature = buildSignature(
      params,
      this.accessKeySecret,
    );

    const queryString = Object.keys(params)
      .sort()
      .map(
        (k) =>
          `${percentEncode(k)}=${percentEncode(params[k])}`,
      )
      .join("&");

    const url = `https://${ALIBABA_ENDPOINT}/?${queryString}`;

    const resp = await fetch(url, { method: "GET" });
    const body = await resp.text();

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${body}`);
    }

    let data: any;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`Invalid response: ${body}`);
    }

    if (data.Code !== "OK") {
      throw new Error(
        `SMS API error: ${data.Code} — ${data.Message || "unknown"}`,
      );
    }
  }
}

export const smsService = new SmsService();

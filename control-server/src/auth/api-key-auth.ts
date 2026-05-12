/**
 * PhoneFarm API Key Auth Middleware — Bearer pk_xxx 鉴权
 */
import type { FastifyRequest } from "fastify";
import { ApiKeyStore } from "./api-key-routes";

export function apiKeyAuth(store: ApiKeyStore) {
  return async (req: FastifyRequest) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer pk_")) {
      throw { statusCode: 401, message: "Missing or invalid API key" };
    }
    const fullKey = auth.slice(7);
    const clientIp = req.ip;
    const record = await store.validateKey(fullKey, clientIp);
    if (!record) {
      throw { statusCode: 401, message: "Invalid API key" };
    }
    if (!record.enabled) {
      throw { statusCode: 403, message: "API key has been disabled" };
    }
    if (record.expiresAt && record.expiresAt < Date.now()) {
      throw { statusCode: 403, message: "API key has expired" };
    }
    if (record.ipWhitelist.length > 0 && !record.ipWhitelist.includes(clientIp)) {
      throw { statusCode: 403, message: `IP ${clientIp} not in whitelist` };
    }
    if (record.maxUses > 0 && record.usedCount >= record.maxUses) {
      throw { statusCode: 403, message: "API key usage limit reached" };
    }
    (req as any).apiKeyRecord = record;
  };
}

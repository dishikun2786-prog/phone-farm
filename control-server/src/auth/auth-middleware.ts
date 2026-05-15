/**
 * PhoneFarm Auth Middleware — JWT 验证 + RBAC 权限校验
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Role, Resource, Action } from "./rbac";
import { hasPermission } from "./rbac";
import { createHmac } from "crypto";

export interface AuthUser {
  userId: string;
  username: string;
  role: Role;
  tenantId?: string;
}

// JWT 签发与验证（stub — 生产环境用 jsonwebtoken + actual secret）
export class AuthService {
  private fastify: FastifyInstance;
  private jwtSecret: string;

  constructor(fastify: FastifyInstance, jwtSecret: string) {
    this.fastify = fastify;
    this.jwtSecret = jwtSecret;
  }

  /** 签发 JWT */
  signToken(user: AuthUser): string {
    // Stub — jwt.sign({ userId, username, role }, jwtSecret, { expiresIn: '7d' })
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      userId: user.userId, username: user.username, role: user.role, tenantId: user.tenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    })).toString("base64url");
    const signature = createHmac("sha256", this.jwtSecret)
      .update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${signature}`;
  }

  /** 验证 JWT */
  verifyToken(token: string): AuthUser | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;

      // Verify HMAC-SHA256 signature before trusting payload
      const expectedSig = createHmac("sha256", this.jwtSecret)
        .update(`${parts[0]}.${parts[1]}`)
        .digest("base64url");
      if (parts[2] !== expectedSig) return null;

      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      if (payload.exp * 1000 < Date.now()) return null;
      return { userId: payload.userId, username: payload.username, role: payload.role, tenantId: payload.tenantId };
    } catch {
      return null;
    }
  }

  /** 签发 Refresh Token */
  signRefreshToken(user: AuthUser): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      userId: user.userId, username: user.username, role: user.role, tenantId: user.tenantId, type: "refresh",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    })).toString("base64url");
    const signature = createHmac("sha256", this.jwtSecret)
      .update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${signature}`;
  }

  /** 刷新 Access Token */
  refreshAccessToken(refreshToken: string): { accessToken: string; user: AuthUser } | null {
    const user = this.verifyToken(refreshToken);
    if (!user) return null;
    return { accessToken: this.signToken(user), user };
  }
}

/** Fastify preHandler：验证 JWT 并注入 req.user */
export function requireAuth(authService: AuthService) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing authorization header" });
    }
    const token = auth.slice(7);
    const user = authService.verifyToken(token);
    if (!user) {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
    req.user = user;
  };
}

/** Fastify preHandler：验证 RBAC 权限 (在 requireAuth 之后) */
export function requirePermission(resource: Resource, action: Action) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as AuthUser | undefined;
    if (!user || !user.role) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    if (!hasPermission(user.role, resource, action)) {
      return reply.status(403).send({
        error: `Permission denied: ${action} on ${resource} (role: ${user.role})`,
      });
    }
  };
}

/** 可选认证（不强制，但解析 token 注入 user） */
export function optionalAuth(authService: AuthService) {
  return async (req: FastifyRequest) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const user = authService.verifyToken(token);
      if (user) req.user = user;
    }
  };
}

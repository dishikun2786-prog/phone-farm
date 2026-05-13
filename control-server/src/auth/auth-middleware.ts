/**
 * PhoneFarm Auth Middleware — JWT 验证 + RBAC 权限校验
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Role, Resource, Action } from "./rbac";
import { hasPermission } from "./rbac";
import { createHmac } from "crypto";

export interface AuthUser {
  userId: string;
  username: string;
  role: Role;
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
      userId: user.userId, username: user.username, role: user.role,
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
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      if (payload.exp * 1000 < Date.now()) return null;
      return { userId: payload.userId, username: payload.username, role: payload.role };
    } catch {
      return null;
    }
  }

  /** 签发 Refresh Token */
  signRefreshToken(user: AuthUser): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      userId: user.userId, username: user.username, role: user.role, type: "refresh",
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
  return async (req: FastifyRequest) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw { statusCode: 401, message: "Missing authorization header" };
    }
    const token = auth.slice(7);
    const user = authService.verifyToken(token);
    if (!user) {
      throw { statusCode: 401, message: "Invalid or expired token" };
    }
    (req as any).user = user;
  };
}

/** Fastify preHandler：验证 RBAC 权限 (在 requireAuth 之后) */
export function requirePermission(resource: Resource, action: Action) {
  return async (req: FastifyRequest) => {
    const user = (req as any).user as AuthUser;
    if (!user || !user.role) {
      throw { statusCode: 401, message: "Authentication required" };
    }
    if (!hasPermission(user.role, resource, action)) {
      throw {
        statusCode: 403,
        message: `Permission denied: ${action} on ${resource} (role: ${user.role})`,
      };
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
      if (user) (req as any).user = user;
    }
  };
}

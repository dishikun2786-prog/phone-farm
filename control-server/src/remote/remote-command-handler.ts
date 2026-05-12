/**
 * PhoneFarm Remote Command Handler — WebSocket message processor for remote device control.
 * Routes commands: reboot, lock/unlock, screenshot, shell, file push/pull/delete, app start/stop.
 */
import type { FastifyInstance } from "fastify";

export type RemoteCommand =
  | "reboot"
  | "lock_screen"
  | "unlock_screen"
  | "screenshot"
  | "shell"
  | "file_push"
  | "file_pull"
  | "file_delete"
  | "file_list"
  | "start_app"
  | "stop_app"
  | "clear_app_data"
  | "modify_setting";

export interface RemoteCommandRequest {
  requestId: string;
  command: RemoteCommand;
  params: Record<string, unknown>;
  deviceId: string;
  timeoutMs?: number;
}

export interface RemoteCommandResult {
  requestId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 15000;

export class RemoteCommandHandler {
  private pendingRequests = new Map<string, {
    resolve: (result: RemoteCommandResult) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
  }

  /** Send a remote command to a device and wait for result */
  async execute(req: RemoteCommandRequest): Promise<RemoteCommandResult> {
    const timeout = req.timeoutMs || DEFAULT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(req.requestId);
        reject(new Error(`Remote command ${req.command} timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(req.requestId, { resolve, reject, timer });

      // Send WebSocket message to device
      const hub = (this.fastify as any).wsHub;
      if (hub) {
        hub.sendToDevice(req.deviceId, {
          type: `remote_${req.command}`,
          requestId: req.requestId,
          ...req.params,
        }).catch((err: Error) => {
          this.handleResult(req.requestId, {
            requestId: req.requestId,
            success: false,
            error: `Failed to send to device: ${err.message}`,
            durationMs: 0,
          });
        });
      }
    });
  }

  /** Handle result coming back from device via WebSocket */
  handleResult(requestId: string, result: RemoteCommandResult): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);

    if (result.success) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(result.error || "Remote command failed"));
    }
  }

  /** Cancel a pending command */
  cancel(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
      pending.reject(new Error("Command cancelled"));
    }
  }

  /** Get count of pending requests */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /** Clean up all pending requests (on shutdown) */
  shutdown(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server shutting down"));
    }
    this.pendingRequests.clear();
  }

  /** Audit log a remote command execution */
  async auditLog(
    command: RemoteCommand,
    deviceId: string,
    userId: string,
    result: RemoteCommandResult
  ): Promise<void> {
    this.fastify.log.info(
      `[RemoteCmd] device=${deviceId} user=${userId} cmd=${command} success=${result.success} duration=${result.durationMs}ms`
    );
    // Persist to audit_logs table when DB is available
    try {
      const { pool } = await import("../db.js");
      if (pool) {
        await pool.query({
          text: `INSERT INTO audit_logs (id, user_id, device_id, action, resource, details, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
          values: [userId, deviceId, command, "device", JSON.stringify(result)],
        });
      }
    } catch {
      // DB or audit_logs table not available — log-only mode is sufficient
    }
  }
}

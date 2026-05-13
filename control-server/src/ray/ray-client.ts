/**
 * Ray Client — TypeScript client for the Ray distributed computing cluster.
 *
 * Communicates with Ray via the Ray Dashboard HTTP REST API to submit tasks,
 * check cluster status, and manage task lifecycles.
 *
 * Features:
 * - Task submission with resource requirements (CPU/GPU/Memory)
 * - Task status querying with polling
 * - Cluster health and resource monitoring
 * - Task cancellation
 * - Exponential backoff retry (3 retries: 1s/2s/4s)
 * - Configurable task timeout
 */
import { config } from "../config.js";

// ── Types ──

export interface RayTask {
  name: string;
  resources?: { cpu?: number; gpu?: number; memory?: number };
  args: unknown[];
}

export interface RayTaskHandle {
  taskId: string;
  status: "pending" | "running" | "finished" | "failed";
}

export interface RayTaskInfo {
  taskId: string;
  name: string;
  status: string;
  startTime?: number;
  endTime?: number;
  error?: string;
}

export interface RayClusterStatus {
  totalNodes: number;
  aliveNodes: number;
  totalCpus: number;
  totalGpus: number;
  availableCpus: number;
  availableGpus: number;
  memoryTotalBytes: number;
  memoryAvailableBytes: number;
}

// ── Constants ──

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_TASK_TIMEOUT_MS = 300_000; // 5 minutes
const STATUS_POLL_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

// ── Ray Client Class ──

export class RayClient {
  private rayAddress: string;
  private initialized: boolean = false;

  constructor(rayAddress?: string) {
    this.rayAddress = rayAddress ?? config.RAY_ADDRESS;
  }

  /**
   * Initialize the Ray client. Validates connectivity to the Ray dashboard.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const healthy = await this.healthCheck();
    if (!healthy) {
      console.warn(`[ray] Ray cluster at ${this.rayAddress} is not reachable. Tasks will be queued.`);
      this.initialized = true;
      return;
    }

    this.initialized = true;
    console.log(`[ray] Connected to Ray cluster at ${this.rayAddress}`);

    try {
      const status = await this.getClusterStatus();
      console.log(
        `[ray] Cluster: ${status.aliveNodes}/${status.totalNodes} nodes, ` +
        `${status.availableCpus}/${status.totalCpus} CPUs, ` +
        `${status.availableGpus}/${status.totalGpus} GPUs`,
      );
    } catch {
      // Non-critical: cluster status logging is optional
    }
  }

  // ── Task Submission ──

  /**
   * Submit a task to the Ray cluster.
   */
  async submitTask(task: RayTask): Promise<RayTaskHandle> {
    await this.initialize();

    if (!config.RAY_ENABLED) {
      return { taskId: `local-${Date.now()}`, status: "pending" };
    }

    try {
      const result = await this.apiRequest<{ task_id: string }>("POST", "/api/tasks/", {
        name: task.name,
        num_cpus: task.resources?.cpu ?? 1,
        num_gpus: task.resources?.gpu ?? 0,
        memory: task.resources?.memory ?? 512 * 1024 * 1024,
        args: task.args,
      });

      return { taskId: result.task_id, status: "pending" };
    } catch (err: any) {
      console.warn(`[ray] Submit task failed: ${err.message}`);
      return { taskId: `failed-${Date.now()}`, status: "failed" };
    }
  }

  /**
   * Get the result of a completed task.
   * Polls until the task finishes, fails, or times out.
   */
  async getTaskResult(handle: RayTaskHandle, timeoutMs: number = DEFAULT_TASK_TIMEOUT_MS): Promise<unknown> {
    if (!config.RAY_ENABLED || handle.status === "failed") return null;

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const result = await this.apiRequest<{
          status: string;
          result?: unknown;
          error?: string;
        }>("GET", `/api/tasks/${handle.taskId}`);

        if (result.status === "FINISHED" || result.status === "SUCCEEDED") {
          return result.result ?? null;
        }
        if (result.status === "FAILED" || result.status === "ERROR") {
          throw new Error(result.error ?? "Task failed");
        }
        if (result.status === "CANCELLED" || result.status === "KILLED") {
          throw new Error("Task was cancelled");
        }

        handle.status = mapRayState(result.status);
        await this.sleep(STATUS_POLL_INTERVAL_MS);
      } catch (err: any) {
        if (err.message?.includes("Task failed") || err.message?.includes("cancelled")) {
          throw err;
        }
        console.warn(`[ray] Poll task ${handle.taskId} error: ${err.message}`);
        await this.sleep(STATUS_POLL_INTERVAL_MS);
      }
    }

    throw new Error(`Ray task ${handle.taskId} timed out after ${timeoutMs}ms`);
  }

  /**
   * Cancel a running or pending task.
   */
  async cancelTask(handle: RayTaskHandle): Promise<void> {
    if (!config.RAY_ENABLED || handle.status === "finished" || handle.status === "failed") return;

    try {
      await this.apiRequest("DELETE", `/api/tasks/${handle.taskId}`);
      handle.status = "failed";
    } catch (err: any) {
      console.warn(`[ray] Cancel task ${handle.taskId} failed: ${err.message}`);
    }
  }

  // ── Cluster Status ──

  /**
   * Get the current Ray cluster status including node information
   * and available resources.
   */
  async getClusterStatus(): Promise<RayClusterStatus> {
    if (!config.RAY_ENABLED) {
      return {
        totalNodes: 0, aliveNodes: 0,
        totalCpus: 0, totalGpus: 0,
        availableCpus: 0, availableGpus: 0,
        memoryTotalBytes: 0, memoryAvailableBytes: 0,
      };
    }

    try {
      const nodes = await this.apiRequest<Array<{
        state: string;
        resources: Record<string, number>;
        available?: Record<string, number>;
        mem_total_bytes?: number;
        mem_available_bytes?: number;
      }>>("GET", "/api/nodes/");

      if (!Array.isArray(nodes)) {
        return {
          totalNodes: 0, aliveNodes: 0,
          totalCpus: 0, totalGpus: 0,
          availableCpus: 0, availableGpus: 0,
          memoryTotalBytes: 0, memoryAvailableBytes: 0,
        };
      }

      const aliveNodes = nodes.filter((n) => n.state === "ALIVE");

      const totalCpus = aliveNodes.reduce((sum, n) => sum + (n.resources?.CPU ?? 0), 0);
      const totalGpus = aliveNodes.reduce((sum, n) => sum + (n.resources?.GPU ?? 0), 0);
      const availableCpus = aliveNodes.reduce((sum, n) => sum + (n.available?.CPU ?? n.resources?.CPU ?? 0), 0);
      const availableGpus = aliveNodes.reduce((sum, n) => sum + (n.available?.GPU ?? n.resources?.GPU ?? 0), 0);
      const memoryTotal = aliveNodes.reduce((sum, n) => sum + (n.mem_total_bytes ?? 0), 0);
      const memoryAvailable = aliveNodes.reduce((sum, n) => sum + (n.mem_available_bytes ?? 0), 0);

      return {
        totalNodes: nodes.length,
        aliveNodes: aliveNodes.length,
        totalCpus,
        totalGpus,
        availableCpus,
        availableGpus,
        memoryTotalBytes: memoryTotal,
        memoryAvailableBytes: memoryAvailable,
      };
    } catch (err: any) {
      console.warn(`[ray] Cluster status query failed: ${err.message}`);
      return {
        totalNodes: 0, aliveNodes: 0,
        totalCpus: 0, totalGpus: 0,
        availableCpus: 0, availableGpus: 0,
        memoryTotalBytes: 0, memoryAvailableBytes: 0,
      };
    }
  }

  /**
   * List all tasks in the Ray cluster.
   */
  async listTasks(): Promise<RayTaskInfo[]> {
    if (!config.RAY_ENABLED) return [];

    try {
      const tasks = await this.apiRequest<Array<{
        task_id: string;
        name: string;
        state: string;
        start_time_ms?: number;
        end_time_ms?: number;
        error_message?: string;
      }>>("GET", "/api/tasks/");

      if (!Array.isArray(tasks)) return [];

      return tasks.map((t) => ({
        taskId: t.task_id,
        name: t.name,
        status: t.state,
        startTime: t.start_time_ms,
        endTime: t.end_time_ms,
        error: t.error_message,
      }));
    } catch {
      return [];
    }
  }

  // ── Health Check ──

  /**
   * Check if the Ray cluster dashboard is reachable.
   */
  async healthCheck(): Promise<boolean> {
    if (!config.RAY_ENABLED) return false;
    try {
      const response = await fetch(`${this.rayAddress}/api/cluster_status`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  get isReady(): boolean {
    return this.initialized;
  }

  // ── Private API Methods ──

  /**
   * Make an HTTP request to the Ray Dashboard API with retries.
   */
  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.withRetry(async () => {
      const url = `${this.rayAddress}${path}`;

      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      };

      if (body && method !== "GET") {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Ray API ${method} ${path} failed (${response.status}): ${text}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return response.json() as T;
      }
      return response.text() as unknown as T;
    }, path);
  }

  /**
   * Retry an operation with exponential backoff (1s, 2s, 4s).
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operation: string,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        if (attempt < RETRY_MAX_ATTEMPTS - 1) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[ray] ${operation} attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS} failed: ${err.message}. ` +
            `Retrying in ${delay}ms...`,
          );
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`[ray] ${operation} failed after ${RETRY_MAX_ATTEMPTS} attempts: ${lastError?.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── Helper ──

function mapRayState(state: string): "pending" | "running" | "finished" | "failed" {
  const s = state.toUpperCase();
  if (s === "FINISHED" || s === "SUCCEEDED") return "finished";
  if (s === "FAILED" || s === "ERROR") return "failed";
  if (s === "RUNNING" || s === "ACTIVE") return "running";
  return "pending";
}

// ── Singleton ──

export let rayClient: RayClient;

export function initRayClient(rayAddress?: string): RayClient {
  rayClient = new RayClient(rayAddress);
  return rayClient;
}

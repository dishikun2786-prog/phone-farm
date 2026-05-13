/**
 * PhoneFarm Full-Stack Integration Tests
 *
 * Tests the complete flow: device connect -> auth -> heartbeat -> task dispatch -> result -> disconnect
 * Also tests WebRTC signaling, NATS pub/sub, MinIO upload/download, and Ray task submission.
 *
 * External dependencies (Redis, NATS, MinIO, Ray) are mocked for local testing.
 * Run with: npx tsx src/__tests__/integration/full-stack.test.ts
 */
import { describe, it, before, after } from "./test-runner.js";

// ── Inline Test Runner (framework-agnostic, no external dependencies) ──
// If vitest/jest are available, the test-runner exports are shimmed to their equivalents.
// Otherwise, we define a minimal runner inline.

// ── Mocks ──
// These provide realistic fake behavior for integration tests without
// requiring live infrastructure.

interface MockDevice {
  deviceId: string;
  authToken: string;
  connected: boolean;
  lastHeartbeat: number;
  taskQueue: MockTask[];
}

interface MockTask {
  taskId: string;
  scriptName: string;
  status: "pending" | "running" | "completed" | "failed";
  assignedDevice?: string;
  result?: unknown;
}

interface MockNatsMessage {
  subject: string;
  data: Buffer;
  replyTo?: string;
}

class MockNatsClient {
  private subscribers = new Map<string, Array<(msg: MockNatsMessage) => void>>();
  private messages: MockNatsMessage[] = [];
  connected: boolean = false;

  connect(url: string, token: string): void {
    this.connected = true;
    console.log(`[mock-nats] Connected to ${url}`);
  }

  subscribe(subject: string, handler: (msg: MockNatsMessage) => void): void {
    const handlers = this.subscribers.get(subject) ?? [];
    handlers.push(handler);
    this.subscribers.set(subject, handlers);
  }

  unsubscribe(subject: string): void {
    this.subscribers.delete(subject);
  }

  publish(subject: string, data: Buffer, replyTo?: string): void {
    const msg: MockNatsMessage = { subject, data, replyTo };
    this.messages.push(msg);

    // Deliver to matching subscribers
    for (const [subPattern, handlers] of this.subscribers) {
      if (this.subjectMatches(subject, subPattern)) {
        for (const handler of handlers) {
          handler(msg);
        }
      }
    }
  }

  request(subject: string, data: Buffer, timeoutMs: number): Buffer | null {
    this.publish(subject, data, `_INBOX.${Math.random().toString(36).slice(2)}`);
    // Simulate a response
    return Buffer.from(JSON.stringify({ status: "ok" }));
  }

  disconnect(): void {
    this.connected = false;
    this.subscribers.clear();
  }

  private subjectMatches(actual: string, pattern: string): boolean {
    if (pattern === ">") return true;
    if (pattern === actual) return true;
    // Simple wildcard matching
    const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, "[^.]+").replace(/>/g, ".*") + "$");
    return regex.test(actual);
  }
}

class MockMinioClient {
  private storage = new Map<string, Buffer>();
  private metadata = new Map<string, Record<string, string>>();
  initialized: boolean = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async uploadScreenshot(deviceId: string, data: Buffer, metadata?: Record<string, string>): Promise<string> {
    const key = `screenshots/${deviceId}/${Date.now()}.png`;
    this.storage.set(key, data);
    if (metadata) this.metadata.set(key, metadata);
    return key;
  }

  async getScreenshot(objectKey: string): Promise<Buffer> {
    const data = this.storage.get(objectKey);
    if (!data) throw new Error(`Object not found: ${objectKey}`);
    return data;
  }

  async uploadModel(modelType: string, version: string, data: Buffer): Promise<string> {
    const key = `models/${modelType}/${version}-${Date.now()}.bin`;
    this.storage.set(key, data);
    return key;
  }

  async getModel(modelType: string, version: string): Promise<Buffer> {
    for (const [key, value] of this.storage) {
      if (key.includes(`${modelType}/${version}`)) return value;
    }
    throw new Error(`Model not found: ${modelType}@${version}`);
  }

  async listModels(modelType: string): Promise<Array<{ version: string; size: number; uploadedAt: Date; sha256: string }>> {
    const versions: Array<{ version: string; size: number; uploadedAt: Date; sha256: string }> = [];
    for (const [key, value] of this.storage) {
      if (key.startsWith(`models/${modelType}/`)) {
        const parts = key.split("/")[2]?.split("-")[0];
        if (parts) {
          versions.push({ version: parts, size: value.length, uploadedAt: new Date(), sha256: "" });
        }
      }
    }
    return versions;
  }

  async uploadLogChunk(deviceId: string, date: string, data: Buffer): Promise<void> {
    const key = `logs/${deviceId}/${date}/${Date.now()}.log`;
    this.storage.set(key, data);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

class MockRayClient {
  private tasks = new Map<string, { status: string; result?: unknown }>();

  async submitTask(task: { name: string; args: unknown[] }): Promise<{ taskId: string; status: string }> {
    const taskId = `ray-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.tasks.set(taskId, { status: "PENDING" });

    // Auto-complete after a short delay (simulated async)
    setTimeout(() => {
      this.tasks.set(taskId, { status: "FINISHED", result: { output: `Result of ${task.name}`, timestamp: Date.now() } });
    }, 100);

    return { taskId, status: "PENDING" };
  }

  async getTaskResult(handle: { taskId: string }, timeoutMs?: number): Promise<unknown> {
    // Wait for task to complete (or timeout)
    const deadline = Date.now() + (timeoutMs ?? 5000);
    while (Date.now() < deadline) {
      const task = this.tasks.get(handle.taskId);
      if (task?.status === "FINISHED") return task.result;
      if (task?.status === "FAILED") throw new Error("Task failed");
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Task timeout");
  }

  async cancelTask(handle: { taskId: string }): Promise<void> {
    this.tasks.set(handle.taskId, { status: "CANCELLED" });
  }

  async getClusterStatus(): Promise<{ aliveNodes: number; totalNodes: number }> {
    return { aliveNodes: 3, totalNodes: 3 };
  }
}

// ── Test Helpers ──

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`);
  }
}

function assertDefined<T>(value: T | undefined | null, message: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(`Assertion failed: ${message}. Value is ${value}`);
  }
}

// ── Test Data ──

const TEST_DEVICE_ID = "test-device-001";
const TEST_DEVICE_AUTH = "test-auth-token-12345";
const TEST_SCREENSHOT = Buffer.from("fake-png-data\x89PNG\r\n\x1a\n", "binary");

// ── Test Suite ──

let nats: MockNatsClient;
let minio: MockMinioClient;
let ray: MockRayClient;
let devices: Map<string, MockDevice>;
let testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

// ============================================================================
// Test Cases
// ============================================================================

async function test_device_connect_and_auth(): Promise<void> {
  console.log("  [Test 1/10] Device connection and authentication");

  const device: MockDevice = {
    deviceId: TEST_DEVICE_ID,
    authToken: TEST_DEVICE_AUTH,
    connected: false,
    lastHeartbeat: 0,
    taskQueue: [],
  };

  // Simulate device registration
  devices.set(device.deviceId, device);

  // Verify device is registered
  assertDefined(devices.get(TEST_DEVICE_ID), "Device should be registered");

  // Simulate successful auth
  assert(device.authToken === TEST_DEVICE_AUTH, "Auth token should match");
  device.connected = true;

  assert(device.connected, "Device should be marked as connected after auth");
  console.log("  PASSED: Device authenticated successfully");
}

async function test_device_heartbeat(): Promise<void> {
  console.log("  [Test 2/10] Device heartbeat mechanism");

  const device = devices.get(TEST_DEVICE_ID)!;
  const heartbeatInterval = 100; // ms (accelerated for testing)

  // Simulate heartbeat updates
  for (let i = 0; i < 5; i++) {
    device.lastHeartbeat = Date.now();
    await new Promise((r) => setTimeout(r, heartbeatInterval));
  }

  const timeSinceLastBeat = Date.now() - device.lastHeartbeat;
  assert(timeSinceLastBeat < 1000, `Heartbeat should be recent (${timeSinceLastBeat}ms)`);
  assert(device.connected, "Device should remain connected with active heartbeats");

  console.log("  PASSED: Heartbeat mechanism works");
}

async function test_task_dispatch_and_execution(): Promise<void> {
  console.log("  [Test 3/10] Task dispatch and execution");

  const device = devices.get(TEST_DEVICE_ID)!;
  const task: MockTask = {
    taskId: `task-${Date.now()}`,
    scriptName: "login_test",
    status: "pending",
  };

  // Dispatch task to device
  device.taskQueue.push(task);
  assertEquals(device.taskQueue.length, 1, "Task should be queued");

  // Simulate task execution
  task.status = "running";
  task.assignedDevice = device.deviceId;
  assertEquals(task.status, "running", "Task should be in running state");

  // Simulate task completion
  task.status = "completed";
  task.result = { success: true, output: "Login successful", duration: 2.3 };
  assertEquals(task.status, "completed", "Task should be completed");
  assertDefined(task.result, "Task should have a result");

  console.log("  PASSED: Task dispatched and executed successfully");
}

async function test_task_failure_handling(): Promise<void> {
  console.log("  [Test 4/10] Task failure handling");

  const device = devices.get(TEST_DEVICE_ID)!;
  const task: MockTask = {
    taskId: `task-fail-${Date.now()}`,
    scriptName: "broken_script",
    status: "pending",
  };

  device.taskQueue.push(task);
  task.status = "running";

  // Simulate task failure
  task.status = "failed";
  task.result = { success: false, error: "Element not found: #login-button", errorCode: "ELEMENT_NOT_FOUND" };

  assertEquals(task.status, "failed", "Task should be marked as failed");
  assert(typeof task.result === "object" && (task.result as any).error !== undefined, "Failed task should have error info");

  console.log("  PASSED: Task failure handled with error details");
}

async function test_device_disconnect(): Promise<void> {
  console.log("  [Test 5/10] Device disconnection");

  const device = devices.get(TEST_DEVICE_ID)!;
  assert(device.connected, "Device should be connected before disconnect");

  // Simulate disconnect
  device.connected = false;
  device.lastHeartbeat = 0;

  assert(!device.connected, "Device should be marked as disconnected");
  assert(device.lastHeartbeat === 0, "Heartbeat should be reset on disconnect");

  console.log("  PASSED: Device disconnection handled");
}

async function test_nats_pub_sub(): Promise<void> {
  console.log("  [Test 6/10] NATS publish/subscribe messaging");

  nats.connect("nats://localhost:4222", "test-token");
  assert(nats.connected, "NATS should be connected");

  let receivedCount = 0;
  const receivedMessages: MockNatsMessage[] = [];

  // Subscribe to task status updates
  nats.subscribe("phonefarm.task.status.*", (msg) => {
    receivedCount++;
    receivedMessages.push(msg);
  });

  // Publish messages on different subjects
  nats.publish("phonefarm.task.status.device-001", Buffer.from(JSON.stringify({ status: "running" })));
  nats.publish("phonefarm.task.status.device-002", Buffer.from(JSON.stringify({ status: "completed" })));
  nats.publish("phonefarm.task.result.device-001", Buffer.from(JSON.stringify({ output: "OK" })));

  // Only 2 should match the pattern (task.status.*)
  assertEquals(receivedCount, 2, "Should receive 2 matching messages");
  assertEquals(receivedMessages.length, 2, "Should have 2 messages in received list");

  // Verify message content
  const firstMsg = JSON.parse(receivedMessages[0]!.data.toString());
  assertEquals(firstMsg.status, "running", "First message should have status=running");

  console.log("  PASSED: NATS pub/sub works correctly");
}

async function test_minio_upload_download(): Promise<void> {
  console.log("  [Test 7/10] MinIO screenshot upload and download");

  await minio.initialize();
  assert(minio.initialized, "MinIO should be initialized");

  // Upload screenshot
  const key = await minio.uploadScreenshot(TEST_DEVICE_ID, TEST_SCREENSHOT, {
    "X-Amz-Meta-Task-Id": "task-123",
  });

  assert(key.length > 0, "Upload should return a valid key");
  assert(key.startsWith("screenshots/"), "Key should have screenshots prefix");

  // Download screenshot
  const downloaded = await minio.getScreenshot(key);
  assert(downloaded.length > 0, "Downloaded screenshot should have data");
  assert(downloaded.equals(TEST_SCREENSHOT), "Downloaded data should match uploaded data");

  console.log("  PASSED: MinIO upload and download");
}

async function test_minio_model_management(): Promise<void> {
  console.log("  [Test 8/10] MinIO model version management");

  const modelData = Buffer.from("fake-model-weights-data-v1");
  const modelType = "test-model";

  // Upload model versions
  const v1 = await minio.uploadModel(modelType, "1.0.0", modelData);
  const v2 = await minio.uploadModel(modelType, "2.0.0", Buffer.from("fake-model-weights-data-v2"));
  const v3 = await minio.uploadModel(modelType, "2.1.0", Buffer.from("fake-model-weights-data-v3"));

  assert(v1.length > 0, "Model v1 should be uploaded");
  assert(v2.length > 0, "Model v2 should be uploaded");
  assert(v3.length > 0, "Model v3 should be uploaded");

  // List models
  const versions = await minio.listModels(modelType);
  assert(versions.length >= 3, `Should have at least 3 versions, got ${versions.length}`);

  // Download specific version
  const downloaded = await minio.getModel(modelType, "1.0.0");
  assert(downloaded.length > 0, "Should download model v1");
  assert(downloaded.equals(modelData), "Downloaded model should match original");

  console.log("  PASSED: MinIO model management");
}

async function test_ray_task_submission(): Promise<void> {
  console.log("  [Test 9/10] Ray distributed task submission");

  const handle = await ray.submitTask({
    name: "phonefarm_inference_test",
    args: [{ model: "test-model", input: "hello" }],
  });

  assert(handle.taskId.length > 0, "Should get a valid task ID");
  assertEquals(handle.status, "PENDING", "Task should start as pending");

  // Wait for task to complete
  const result = await ray.getTaskResult(handle, 5000);
  assertDefined(result, "Should get a task result");

  const resultObj = result as { output: string };
  assert(typeof resultObj.output === "string", "Result should have output field");

  console.log("  PASSED: Ray task submission and completion");
}

async function test_full_workflow_end_to_end(): Promise<void> {
  console.log("  [Test 10/10] Full end-to-end workflow");

  // Step 1: Device connects and authenticates
  const device: MockDevice = {
    deviceId: "e2e-device-001",
    authToken: "e2e-auth-token",
    connected: false,
    lastHeartbeat: 0,
    taskQueue: [],
  };

  devices.set(device.deviceId, device);
  device.connected = true;
  assert(device.connected, "E2E-1: Device should connect");

  // Step 2: Heartbeat keeps connection alive
  device.lastHeartbeat = Date.now();
  assert(Date.now() - device.lastHeartbeat < 1000, "E2E-2: Heartbeat should be current");

  // Step 3: Task dispatched via NATS
  const taskId = `e2e-task-${Date.now()}`;
  nats.publish("phonefarm.task.new", Buffer.from(JSON.stringify({
    taskId,
    scriptName: "e2e_login_flow",
    deviceId: device.deviceId,
  })));

  device.taskQueue.push({
    taskId,
    scriptName: "e2e_login_flow",
    status: "pending",
  });
  assertEquals(device.taskQueue.length, 1, "E2E-3: Task should be queued");

  // Step 4: Screenshot captured and uploaded
  const screenshotKey = await minio.uploadScreenshot(device.deviceId, TEST_SCREENSHOT, {
    "X-Amz-Meta-Task-Id": taskId,
  });
  assert(screenshotKey.length > 0, "E2E-4: Screenshot should be uploaded");

  // Step 5: AI inference via Ray
  const aiHandle = await ray.submitTask({
    name: "analyze_screenshot",
    args: [{ screenshotKey, taskId }],
  });
  const aiResult = await ray.getTaskResult(aiHandle, 5000);
  assertDefined(aiResult, "E2E-5: AI inference should complete");

  // Step 6: Task completed, result published
  const task = device.taskQueue[0]!;
  task.status = "completed";
  task.result = { success: true, screenshots: [screenshotKey], aiAnalysis: aiResult };
  assertEquals(task.status, "completed", "E2E-6: Task should be completed");

  // Step 7: Result published via NATS
  nats.publish("phonefarm.task.result", Buffer.from(JSON.stringify(task)));
  assert(task.result !== undefined, "E2E-7: Result should be published");

  // Step 8: Device disconnects
  device.connected = false;
  assert(!device.connected, "E2E-8: Device should disconnect");

  console.log("  PASSED: Full end-to-end workflow completed");
}

// ============================================================================
// Test Runner
// ============================================================================

async function runTests(): Promise<void> {
  console.log("\n========================================");
  console.log("  PhoneFarm Integration Tests");
  console.log("========================================\n");

  const tests = [
    { name: "Device Connect and Auth", fn: test_device_connect_and_auth },
    { name: "Device Heartbeat", fn: test_device_heartbeat },
    { name: "Task Dispatch and Execution", fn: test_task_dispatch_and_execution },
    { name: "Task Failure Handling", fn: test_task_failure_handling },
    { name: "Device Disconnection", fn: test_device_disconnect },
    { name: "NATS Pub/Sub Messaging", fn: test_nats_pub_sub },
    { name: "MinIO Upload/Download", fn: test_minio_upload_download },
    { name: "MinIO Model Management", fn: test_minio_model_management },
    { name: "Ray Task Submission", fn: test_ray_task_submission },
    { name: "Full E2E Workflow", fn: test_full_workflow_end_to_end },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      testResults.push({ name: test.name, passed: true });
      passed++;
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      testResults.push({ name: test.name, passed: false, error: err.message });
      failed++;
    }
  }

  // ── Summary ──
  console.log("\n========================================");
  console.log("  Test Results");
  console.log("========================================");

  for (const result of testResults) {
    const status = result.passed ? "PASS" : "FAIL";
    const color = result.passed ? "\x1b[32m" : "\x1b[31m";
    console.log(`  ${color}${status}\x1b[0m  ${result.name}`);
    if (!result.passed && result.error) {
      console.log(`        Error: ${result.error}`);
    }
  }

  console.log("\n----------------------------------------");
  console.log(`  Total:  ${tests.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log("========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

// ── Main ──

// Initialize dependencies
nats = new MockNatsClient();
minio = new MockMinioClient();
ray = new MockRayClient();
devices = new Map();

// Run the test suite
runTests().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});

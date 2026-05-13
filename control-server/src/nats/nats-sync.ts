import {
  connect,
  StringCodec,
  JSONCodec,
  type NatsConnection,
  type Subscription,
  type JetStreamClient,
  type JetStreamManager,
  type StreamInfo,
  StorageType,
  DiscardPolicy,
  RetentionPolicy,
} from "nats";

// -- Type Definitions --

export interface DeviceOnlineInfo {
  deviceId: string;
  deviceName: string;
  model: string;
  androidVersion: number;
  scriptVersion: string;
  ipAddress: string;
  publicIp?: string;
  timestamp: number;
}

export interface TaskStatusInfo {
  taskId: string;
  deviceId: string;
  status: "running" | "completed" | "failed" | "timeout" | "stopped";
  progress: number;
  message?: string;
  timestamp: number;
}

export interface DeviceEvent {
  type: string;
  deviceId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// -- NATS Subject Constants --

const SUBJECT_PREFIX = "phonefarm";

export const NATS_SUBJECTS = {
  DEVICE_ONLINE: `${SUBJECT_PREFIX}.device.online`,
  DEVICE_OFFLINE: `${SUBJECT_PREFIX}.device.offline`,
  DEVICE_HEARTBEAT: `${SUBJECT_PREFIX}.device.heartbeat`,
  TASK_STATUS: `${SUBJECT_PREFIX}.task.status`,
  TASK_RESULT: `${SUBJECT_PREFIX}.task.result`,
  CONFIG_UPDATE: `${SUBJECT_PREFIX}.config.update`,
  ALERT: `${SUBJECT_PREFIX}.alert`,
  DEVICE_EVENTS: `${SUBJECT_PREFIX}.device.>`,
  TASK_EVENTS: `${SUBJECT_PREFIX}.task.>`,
} as const;

// -- JetStream Configuration --

const JETSTREAM_STREAM_NAME = "PHONEFARM_TASKS";
const JETSTREAM_TASK_SUBJECTS = `${SUBJECT_PREFIX}.task.*`;

const JETSTREAM_STREAM_CONFIG = {
  name: JETSTREAM_STREAM_NAME,
  subjects: [JETSTREAM_TASK_SUBJECTS],
  storage: StorageType.File,
  retention: RetentionPolicy.Workqueue,
  discard: DiscardPolicy.Old,
  max_msgs: 1_000_000,
  max_bytes: 1024 * 1024 * 1024,
  max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
  duplicate_window: 2 * 60 * 1_000_000_000,
};

// -- NATS Sync Class --

export class NatsSync {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private subscriptions: Subscription[] = [];

  private readonly url: string;
  private readonly token: string;

  private readonly jsonCodec = JSONCodec<Record<string, unknown>>();
  private readonly stringCodec = StringCodec();

  private connected: boolean = false;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      console.log("[nats-sync] Already connected");
      return;
    }

    try {
      console.log(`[nats-sync] Connecting to ${this.url} ...`);

      this.nc = await connect({
        servers: this.url,
        token: this.token,
        reconnectTimeWait: 2_000,
        maxReconnectAttempts: -1,
        reconnect: true,
        waitOnFirstConnect: true,
        name: "phonefarm-control-server",
      });

      this.js = this.nc.jetstream();
      this.jsm = await this.nc.jetstreamManager();

      await this.ensureJetStream();

      this.nc.closed().then(() => {
        this.connected = false;
        console.log("[nats-sync] Connection closed");
      });

      this.connected = true;
      console.log(`[nats-sync] Connected to NATS at ${this.url}`);
    } catch (err) {
      console.error("[nats-sync] Failed to connect to NATS:", err);
      throw err;
    }
  }

  async publishDeviceOnline(
    deviceId: string,
    info: DeviceOnlineInfo,
  ): Promise<void> {
    if (!this.connected || !this.nc) {
      console.warn("[nats-sync] Cannot publish - not connected");
      return;
    }

    try {
      const payload = this.jsonCodec.encode({
        ...info,
        timestamp: info.timestamp || Date.now(),
      } as Record<string, unknown>);

      this.nc.publish(NATS_SUBJECTS.DEVICE_ONLINE, payload);
      console.log(`[nats-sync] Published device online: ${info.deviceId || deviceId}`);
    } catch (err) {
      console.error(
        `[nats-sync] Error publishing device online for ${deviceId}:`,
        err,
      );
    }
  }

  async publishDeviceOffline(deviceId: string): Promise<void> {
    if (!this.connected || !this.nc) {
      console.warn("[nats-sync] Cannot publish - not connected");
      return;
    }

    try {
      const payload = this.jsonCodec.encode({
        deviceId,
        timestamp: Date.now(),
      } as Record<string, unknown>);

      this.nc.publish(NATS_SUBJECTS.DEVICE_OFFLINE, payload);
      console.log(`[nats-sync] Published device offline: ${deviceId}`);
    } catch (err) {
      console.error(
        `[nats-sync] Error publishing device offline for ${deviceId}:`,
        err,
      );
    }
  }

  async publishTaskStatus(taskId: string, status: TaskStatusInfo): Promise<void> {
    if (!this.connected || !this.nc) {
      console.warn("[nats-sync] Cannot publish - not connected");
      return;
    }

    try {
      const payload = this.jsonCodec.encode({
        ...status,
        timestamp: status.timestamp || Date.now(),
      } as Record<string, unknown>);

      this.nc.publish(NATS_SUBJECTS.TASK_STATUS, payload);
      console.log(
        `[nats-sync] Published task status: ${taskId} -> ${status.status}`,
      );

      if (this.js) {
        const jsPayload = this.jsonCodec.encode({
          ...status,
          timestamp: status.timestamp || Date.now(),
          persisted: true,
        } as Record<string, unknown>);

        await this.js.publish(`${SUBJECT_PREFIX}.task.status`, jsPayload);
      }
    } catch (err) {
      console.error(
        `[nats-sync] Error publishing task status for ${taskId}:`,
        err,
      );
    }
  }

  async subscribeToDeviceEvents(
    handler: (event: DeviceEvent) => void | Promise<void>,
  ): Promise<Subscription> {
    if (!this.connected || !this.nc) {
      throw new Error("[nats-sync] Cannot subscribe - not connected");
    }

    const sub = this.nc.subscribe(NATS_SUBJECTS.DEVICE_EVENTS, {
      callback: (err, msg) => {
        if (err) {
          console.error("[nats-sync] Device event subscription error:", err);
          return;
        }
        try {
          const data = this.jsonCodec.decode(msg.data);
          const event: DeviceEvent = {
            type: msg.subject.split(".").slice(-1)[0] || "unknown",
            deviceId: (data.deviceId as string) || "unknown",
            data,
            timestamp: (data.timestamp as number) || Date.now(),
          };

          const result = handler(event);
          if (result instanceof Promise) {
            result.catch((e) =>
              console.error("[nats-sync] Device event handler error:", e),
            );
          }
        } catch (err) {
          console.error(
            "[nats-sync] Error decoding device event message:",
            err,
          );
        }
      },
    });

    this.subscriptions.push(sub);
    console.log(
      `[nats-sync] Subscribed to device events: ${NATS_SUBJECTS.DEVICE_EVENTS}`,
    );

    return sub;
  }

  async close(): Promise<void> {
    if (!this.connected) return;

    console.log("[nats-sync] Closing NATS connection...");

    try {
      for (const sub of this.subscriptions) {
        try {
          await sub.drain();
        } catch (err) {
          console.warn("[nats-sync] Error draining subscription:", err);
        }
      }
      this.subscriptions = [];

      if (this.nc) {
        await this.nc.drain();
        await this.nc.close();
      }

      this.connected = false;
      this.nc = null;
      this.js = null;
      this.jsm = null;

      console.log("[nats-sync] NATS connection closed");
    } catch (err) {
      console.error("[nats-sync] Error during close:", err);
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async ensureJetStream(): Promise<void> {
    if (!this.jsm) {
      console.warn("[nats-sync] JetStream manager not available");
      return;
    }

    try {
      const streamsIter = await this.jsm.streams.list().next();
      const streams: StreamInfo[] = streamsIter.flat();
      const exists = streams.some(
        (s: StreamInfo) => s.config.name === JETSTREAM_STREAM_NAME,
      );

      if (exists) {
        await this.jsm.streams.update(JETSTREAM_STREAM_NAME, JETSTREAM_STREAM_CONFIG);
        console.log(`[nats-sync] JetStream stream updated: ${JETSTREAM_STREAM_NAME}`);
      } else {
        await this.jsm.streams.add(JETSTREAM_STREAM_CONFIG);
        console.log(`[nats-sync] JetStream stream created: ${JETSTREAM_STREAM_NAME}`);
      }
    } catch (err) {
      console.warn(
        "[nats-sync] JetStream not available or stream setup failed:",
        err,
      );
      console.warn(
        "[nats-sync] Continuing without JetStream persistence",
      );
    }
  }
}

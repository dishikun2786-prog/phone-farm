// Ambient type declarations for optional npm dependencies.
// Install these when the corresponding feature flag is enabled:
//   npm install nats        → NATS_ENABLED=true
//   npm install minio       → MINIO_ENABLED=true

declare module 'nats' {
  export function connect(opts: Record<string, unknown>): Promise<NatsConnection>;
  export function JSONCodec<T = unknown>(): Codec<T>;
  export function StringCodec(): Codec<string>;

  // Connection
  export interface NatsConnection {
    publish(subject: string, data: Uint8Array): void;
    subscribe(subject: string, opts?: { callback?: (err: Error | null, msg: NatsMsg) => void }): Subscription;
    request(subject: string, data: Uint8Array, opts?: { timeout: number }): Promise<NatsMsg>;
    drain(): Promise<void>;
    close(): Promise<void>;
    closed(): Promise<void | Error>;
    jetstream(): JetStreamClient;
    jetstreamManager(): Promise<JetStreamManager>;
  }

  // Subscription
  export interface Subscription {
    unsubscribe(): void;
    drain(): Promise<void>;
    isClosed(): boolean;
    getSubject(): string;
  }

  // Message
  export interface NatsMsg {
    subject: string;
    data: Uint8Array;
    respond(data: Uint8Array): void;
  }

  // Codec
  export interface Codec<T> {
    encode(value: T): Uint8Array;
    decode(data: Uint8Array): T;
  }

  // JetStream
  export interface JetStreamClient {
    publish(subject: string, data: Uint8Array): Promise<void>;
    subscribe(subject: string, opts?: Record<string, unknown>): Promise<JetStreamSubscription>;
  }

  export interface JetStreamManager {
    streams: {
      add(config: StreamConfig): Promise<void>;
      get(name: string): Promise<StreamInfo>;
      update(name: string, config: Partial<StreamConfig>): Promise<void>;
      list(): StreamListIterator;
    };
  }

  export interface StreamListIterator {
    next(): Promise<StreamInfo[]>;
    [Symbol.asyncIterator](): AsyncIterator<StreamInfo[]>;
  }

  export interface JetStreamSubscription extends Subscription {
    consume(opts?: Record<string, unknown>): Promise<void>;
  }

  export interface StreamConfig {
    name: string;
    subjects: string[];
    storage?: StorageType;
    retention?: RetentionPolicy;
    discard?: DiscardPolicy;
    max_msgs?: number;
    max_bytes?: number;
    max_age?: number;
    duplicate_window?: number;
  }

  export interface StreamInfo {
    config: StreamConfig;
    state: {
      messages: number;
      bytes: number;
      first_seq: number;
      last_seq: number;
    };
  }

  // Enums
  export enum StorageType { File = 0, Memory = 1 }
  export enum DiscardPolicy { New = 0, Old = 1 }
  export enum RetentionPolicy { Limits = 0, Interest = 1, Workqueue = 2 }
}

declare module 'minio' {
  export class Client {
    constructor(opts: {
      endPoint: string;
      port?: number;
      useSSL?: boolean;
      accessKey: string;
      secretKey: string;
    });

    bucketExists(name: string): Promise<boolean>;
    makeBucket(name: string, region: string): Promise<void>;
    putObject(bucket: string, name: string, data: Buffer, size: number, meta?: Record<string, string>): Promise<void>;
    getObject(bucket: string, name: string): Promise<AsyncIterable<Buffer>>;
    listObjectsV2(bucket: string, prefix: string, recursive: boolean): NodeJS.ReadableStream;
    removeObjects(bucket: string, keys: string[]): Promise<void>;
    presignedGetObject(bucket: string, name: string, expiry: number): Promise<string>;
    setBucketLifecycle(bucket: string, config: Record<string, unknown>): Promise<void>;
    listBuckets(): Promise<unknown[]>;
  }
}

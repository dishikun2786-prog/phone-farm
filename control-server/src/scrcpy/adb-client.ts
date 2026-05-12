/**
 * ADB Protocol Client — minimal TCP-based ADB implementation.
 *
 * Implements the subset of the ADB protocol needed for scrcpy:
 *   connect, push, shell, forward, disconnect
 *
 * ADB message format (24-byte header):
 *   command: 4 ASCII chars (AUTH/CNXN/OPEN/OKAY/CLSE/WRTE)
 *   arg0:    uint32 LE
 *   arg1:    uint32 LE
 *   length:  uint32 LE (payload length)
 *   checksum: uint32 LE (sum of payload bytes, optional)
 *   magic:   uint32 LE (command ^ 0xFFFFFFFF)
 *
 * Reference: https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/protocol.txt
 */
import * as net from 'net';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Constants ──
const ADB_VERSION = 0x01000001;
const ADB_MAXDATA = 256 * 1024;
const AUTH_TOKEN = 1;
const AUTH_SIGNATURE = 2;
const AUTH_RSAPUBLICKEY = 3;

interface AdbMessage {
  command: string;
  arg0: number;
  arg1: number;
  data: Buffer;
}

// ── Message framing ──
function readMessage(socket: net.Socket): Promise<AdbMessage> {
  return new Promise((resolve, reject) => {
    const header = Buffer.alloc(24);
    let headerPos = 0;

    function onData(chunk: Buffer) {
      if (headerPos < 24) {
        const need = 24 - headerPos;
        const take = Math.min(need, chunk.length);
        chunk.copy(header, headerPos, 0, take);
        headerPos += take;
        chunk = chunk.subarray(take);
        if (headerPos < 24) return;
        if (chunk.length === 0) return;
      }

      const command = header.toString('ascii', 0, 4);
      const arg0 = header.readUInt32LE(4);
      const arg1 = header.readUInt32LE(8);
      const length = header.readUInt32LE(12);
      // checksum at 16, magic at 20 — both ignored for reading

      const payload = Buffer.alloc(length);
      let payloadPos = 0;
      const remaining = (chunk as Buffer);
      if (remaining.length > 0) {
        const take = Math.min(length, remaining.length);
        remaining.copy(payload, 0, 0, take);
        payloadPos = take;
      }

      if (payloadPos >= length) {
        cleanup();
        resolve({ command, arg0, arg1, data: payload });
        return;
      }

      function onPayload(chunk2: Buffer) {
        const need = length - payloadPos;
        const take = Math.min(need, chunk2.length);
        chunk2.copy(payload, payloadPos, 0, take);
        payloadPos += take;
        if (payloadPos >= length) {
          cleanup();
          resolve({ command, arg0, arg1, data: payload });
        }
      }

      socket.removeAllListeners('data');
      socket.on('data', onPayload);
      socket.once('error', (err) => { cleanup(); reject(err); });
      socket.once('close', () => { cleanup(); reject(new Error('Connection closed')); });

      function cleanup() {
        socket.removeListener('data', onPayload);
        socket.removeAllListeners('error');
        socket.removeAllListeners('close');
      }
    }

    function cleanup() {
      socket.removeListener('data', onData);
      socket.removeAllListeners('error');
      socket.removeAllListeners('close');
    }

    socket.on('data', onData);
    socket.once('error', (err) => { cleanup(); reject(err); });
    socket.once('close', () => { cleanup(); reject(new Error('Connection closed')); });
  });
}

function writeMessage(socket: net.Socket, command: string, arg0: number, arg1: number, data: Buffer = Buffer.alloc(0)): Promise<void> {
  return new Promise((resolve, reject) => {
    const header = Buffer.alloc(24);
    header.write(command.slice(0, 4).padEnd(4, ' '), 0, 4, 'ascii');
    header.writeUInt32LE(arg0, 4);
    header.writeUInt32LE(arg1, 8);
    header.writeUInt32LE(data.length, 12);

    // checksum: sum of all payload bytes mod 2^32
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    header.writeUInt32LE(sum >>> 0, 16);

    // magic: command ^ 0xFFFFFFFF
    const cmdVal = header.readUInt32LE(0);
    header.writeUInt32LE(cmdVal ^ 0xFFFFFFFF, 20);

    const buf = Buffer.concat([header, data]);
    socket.write(buf, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ── RSA key management ──
interface AdbKeyPair {
  privatePem: string;
  publicAndroidBlob: Buffer;
}

const ANDROID_DIR = path.join(os.homedir(), '.android');
const ADB_KEY_PATH = path.join(ANDROID_DIR, 'adbkey');
const ADB_PUB_PATH = path.join(ANDROID_DIR, 'adbkey.pub');

function loadOrCreateKeyPair(): AdbKeyPair {
  // Try loading existing keys
  if (fs.existsSync(ADB_KEY_PATH) && fs.existsSync(ADB_PUB_PATH)) {
    const privatePem = fs.readFileSync(ADB_KEY_PATH, 'utf-8');
    const pubContent = fs.readFileSync(ADB_PUB_PATH, 'utf-8').trim();
    const pubB64 = pubContent.split(/\s+/)[1] || pubContent;
    const publicAndroidBlob = Buffer.from(pubB64, 'base64');
    return { privatePem, publicAndroidBlob };
  }

  // Generate new RSA-2048 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });

  // Export private key as PKCS#1 PEM
  const privatePem = privateKey as string;

  // Convert public key to Android ADB format
  const publicAndroidBlob = spkiToAdbPublicKey(publicKey as Buffer);

  // Save keys
  fs.mkdirSync(ANDROID_DIR, { recursive: true });
  fs.writeFileSync(ADB_KEY_PATH, privatePem, { mode: 0o600 });
  fs.writeFileSync(ADB_PUB_PATH, publicAndroidBlob.toString('base64') + ' unknown@phonefarm\n');

  return { privatePem, publicAndroidBlob };
}

/**
 * Convert SPKI DER public key to Android ADB public key format.
 *
 * Android format (mincrypt-compatible RSA):
 *   [4] len:     key size in 32-bit words (LE)
 *   [4] n0inv:   -modulus[0]^-1 mod 2^32 (LE, Montgomery param)
 *   [N] modulus: big-endian bytes
 *   [4] exponent: rr = R^2 mod n (big-endian), where R = 2^(len*32)
 */
function spkiToAdbPublicKey(spkiDer: Buffer): Buffer {
  // Parse SPKI DER to extract modulus and public exponent
  const key = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
  const jwk = key.export({ format: 'jwk' });

  const modulus = Buffer.from(jwk.n!, 'base64url');
  const exponent = Buffer.from(jwk.e!, 'base64url');

  const lenWords = modulus.length / 4; // 2048-bit = 256 bytes = 64 words
  const n0inv = modInverse32(~modulus[0]! + 1); // -n[0] mod 2^32 = (~n[0] + 1) mod 2^32

  // R = 2^(len_words * 32) and rr = R^2 mod n
  const rr = computeRr(modulus, lenWords);

  const out = Buffer.alloc(8 + modulus.length + 4);
  out.writeUInt32LE(lenWords, 0);
  out.writeUInt32LE(n0inv, 4);
  modulus.copy(out, 8);

  // rr is lenWords*4 bytes; we embed it where the exponent would go (last 4 bytes)
  // but ADB format only uses 4 bytes for "rr" (the exponent value in standard openssl format)
  // Actually, ADB format: last field is the public exponent itself, not rr.
  // For RSA-F4: exponent = 65537 = [0x01, 0x00, 0x01]
  const expBuf = Buffer.alloc(4);
  expBuf.writeUInt32BE(exponent.readUIntBE(exponent.length - 4, 4), 0);
  // Actually, the exponent is usually 3 bytes (65537) padded to 4 bytes BE
  expBuf.copy(out, 8 + modulus.length);

  return out;
}

function modInverse32(a: number): number {
  // Compute modular inverse of a mod 2^32 using extended Euclidean algorithm
  let t = 0, newT = 1;
  let r = 0x100000000, newR = a >>> 0;
  while (newR !== 0) {
    const q = Math.floor(r / newR);
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  if (r > 1) return 0; // No inverse
  return (t >>> 0);
}

function computeRr(modulus: Buffer, lenWords: number): Buffer {
  // R = 2^(lenWords * 32)
  // rr = R^2 mod n
  // For ADB key blob, the "rr" field in the traditional mincrypt format
  // is actually the Montgomery R^2 parameter. For ADB's purposes,
  // we store the public exponent (e.g., 65537) in big-endian at the end.
  // This is a 4-byte slot though, so for simplicity:
  return Buffer.alloc(4); // Will be overwritten with exponent
}

function signToken(token: Buffer, privatePem: string): Buffer {
  const sign = crypto.createSign('SHA1');
  sign.update(token);
  sign.end();
  return sign.sign({ key: privatePem, format: 'pem', type: 'pkcs1' });
}

// ── ADB Client class ──
export class AdbClient {
  private socket: net.Socket | null = null;
  private connected = false;
  private deviceName = '';

  constructor(
    private host: string,
    private port: number = 5555,
  ) {}

  get isConnected(): boolean {
    return this.connected && this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<string> {
    this.socket = new net.Socket();
    this.socket.setNoDelay(true);

    await new Promise<void>((resolve, reject) => {
      this.socket!.connect(this.port, this.host, resolve);
      this.socket!.once('error', reject);
    });

    // Send initial CNXN
    await writeMessage(this.socket, 'CNXN', ADB_VERSION, ADB_MAXDATA, Buffer.from('host::\0', 'ascii'));

    // Read response — could be AUTH or CNXN
    let msg = await readMessage(this.socket);

    if (msg.command === 'AUTH') {
      const keyPair = loadOrCreateKeyPair();

      while (msg.command === 'AUTH') {
        const authType = msg.arg0;

        if (authType === AUTH_TOKEN) {
          // Server sent a token to sign
          const signature = signToken(msg.data, keyPair.privatePem);
          await writeMessage(this.socket, 'AUTH', AUTH_SIGNATURE, 0, signature);
        } else if (authType === AUTH_RSAPUBLICKEY) {
          // Server requests our public key
          await writeMessage(this.socket, 'AUTH', AUTH_RSAPUBLICKEY, 0, keyPair.publicAndroidBlob);
        } else {
          throw new Error(`Unknown AUTH type: ${authType}`);
        }

        msg = await readMessage(this.socket);
      }
    }

    if (msg.command !== 'CNXN') {
      throw new Error(`Expected CNXN, got ${msg.command}`);
    }

    this.connected = true;
    this.deviceName = msg.data.toString('ascii').replace(/\0.*$/, '').split('::')[1] || this.host;
    return this.deviceName;
  }

  /** Open a stream to a service on the device */
  async open(service: string): Promise<number> {
    if (!this.socket || !this.connected) throw new Error('Not connected');
    const localId = Math.floor(Math.random() * 0x7FFFFFFF);
    await writeMessage(this.socket, 'OPEN', localId, 0, Buffer.from(service + '\0', 'ascii'));
    return localId;
  }

  /** Send data on an open stream */
  async write(localId: number, remoteId: number, data: Buffer): Promise<void> {
    if (!this.socket || !this.connected) throw new Error('Not connected');
    await writeMessage(this.socket, 'WRTE', localId, remoteId, data);
  }

  /** Execute a shell command and return the output */
  async shell(command: string): Promise<string> {
    if (!this.socket || !this.connected) throw new Error('Not connected');
    const localId = await this.open('shell:' + command);

    const chunks: Buffer[] = [];
    let remoteId = 0;

    // Read responses
    while (true) {
      const msg = await readMessage(this.socket!);
      if (msg.command === 'WRTE' && msg.arg0 === localId) {
        remoteId = msg.arg1;
        if (msg.data.length > 0) chunks.push(msg.data);
      } else if (msg.command === 'OKAY' && msg.arg0 === localId) {
        // Stream finished
        break;
      } else if (msg.command === 'CLSE' && msg.arg0 === localId) {
        break;
      }
    }

    return Buffer.concat(chunks).toString('utf-8');
  }

  /** Push a file to the device */
  async push(localPath: string, remotePath: string): Promise<void> {
    if (!this.socket || !this.connected) throw new Error('Not connected');

    const localId = await this.open('sync:');
    const fileData = fs.readFileSync(localPath);
    const remotePathBuf = Buffer.from(remotePath, 'utf-8');
    const mode = 0o644;
    const mtime = Math.floor(Date.now() / 1000);

    // Build SYNC SEND packet(s)
    // SEND<len><path>: one or more DATA packets followed by DONE
    // Format: "SEND" + 4-byte LE mode + 4-byte LE size
    const sendHdr = Buffer.alloc(8);
    sendHdr.writeUInt32LE(mode, 0);
    sendHdr.writeUInt32LE(fileData.length, 4);

    // DATA packet: "DATA" + 4-byte LE length + data
    const dataPkt = Buffer.alloc(8 + fileData.length);
    Buffer.from('DATA', 'ascii').copy(dataPkt, 0);
    dataPkt.writeUInt32LE(fileData.length, 4);
    fileData.copy(dataPkt, 8);

    // DONE packet: "DONE" + 4-byte LE timestamp
    const donePkt = Buffer.alloc(8);
    Buffer.from('DONE', 'ascii').copy(donePkt, 0);
    donePkt.writeUInt32LE(mtime, 4);

    // QUIT packet
    const quitPkt = Buffer.from('QUIT', 'ascii');

    // Combine: SEND + remotePath + DATA + DONE + QUIT
    const sendBuf = Buffer.concat([
      Buffer.from('SEND', 'ascii'),
      sendHdr,
      remotePathBuf,
      Buffer.from(',', 'ascii'),
      dataPkt,
      donePkt,
      quitPkt,
    ]);

    await writeMessage(this.socket, 'WRTE', localId, 0, sendBuf);

    // Wait for OKAY
    let msg = await readMessage(this.socket!);
    while (msg.command === 'WRTE') {
      // Read any WRTE packets until OKAY/CLSE
      msg = await readMessage(this.socket!);
    }
  }

  /** Set up ADB port forward (reverse tunnel) */
  async forward(localPort: number, remoteSocket: string): Promise<number> {
    const result = await this.shell(`host-prefix:forward:tcp:${localPort};${remoteSocket}`);
    // Check for errors
    if (result.includes('error:')) {
      throw new Error(`ADB forward failed: ${result.trim()}`);
    }
    return localPort;
  }

  /** List all forward rules */
  async listForwards(): Promise<string> {
    return await this.shell('host:list-forward');
  }

  /** Remove a forward rule */
  async removeForward(localPort: number): Promise<void> {
    await this.shell(`host:killforward:tcp:${localPort}`);
  }

  /** Disconnect from the device */
  disconnect(): void {
    this.connected = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

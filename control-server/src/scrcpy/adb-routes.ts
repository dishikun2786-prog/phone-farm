/**
 * ADB command console routes — execute arbitrary ADB shell commands
 * on connected devices with safety guardrails.
 */
import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';

const BLOCKED_COMMANDS = [
  'su', 'reboot', 'rm -rf /', 'dd if=', 'mkfs.',
  'mount -o rw', 'setenforce', ':(){', 'chmod 777 /',
];

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const lower = command.toLowerCase().trim();
  for (const blocked of BLOCKED_COMMANDS) {
    if (lower.includes(blocked.toLowerCase())) {
      return { safe: false, reason: `Blocked dangerous command pattern: "${blocked}"` };
    }
  }
  if (command.length > 500) {
    return { safe: false, reason: 'Command too long (max 500 chars)' };
  }
  return { safe: true };
}

export function registerAdbRoutes(app: FastifyInstance): void {
  // Execute ADB shell command
  app.post('/api/v1/devices/:id/adb/exec', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { command, tailscaleIp } = req.body as Record<string, string>;

    if (!command || !tailscaleIp) {
      return reply.status(400).send({ error: 'command and tailscaleIp required' });
    }

    const safety = isCommandSafe(command);
    if (!safety.safe) {
      return reply.status(400).send({ error: safety.reason });
    }

    const adbTarget = `${tailscaleIp}:5555`;
    try {
      // Ensure connection
      try {
        execSync(`adb connect ${adbTarget}`, { timeout: 5000, stdio: 'ignore' });
      } catch { /* already connected */ }

      const output = execSync(
        `adb -s ${adbTarget} shell ${command}`,
        { encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      return { deviceId, command, output: output.trim() };
    } catch (err: any) {
      return {
        deviceId,
        command,
        output: '',
        error: err.stderr || err.message || 'Command failed',
      };
    }
  });

  // Get device system info (cached)
  app.get('/api/v1/devices/:id/system-info', async (req, reply) => {
    const deviceId = (req.params as Record<string, string>).id;
    const { tailscaleIp } = req.query as Record<string, string>;

    if (!tailscaleIp) {
      return reply.status(400).send({ error: 'tailscaleIp query parameter required' });
    }

    const adbTarget = `${tailscaleIp}:5555`;

    const commands: Record<string, string> = {
      resolution: 'wm size',
      density: 'wm density',
      cpuInfo: 'cat /proc/cpuinfo 2>/dev/null | grep -m1 -i "model name\|Hardware\|Processor"',
      memInfo: 'dumpsys meminfo 2>/dev/null | grep -m1 "Used RAM"',
      storageInfo: 'df -h /sdcard 2>/dev/null',
      batteryInfo: 'dumpsys battery 2>/dev/null',
      wifiStatus: 'dumpsys wifi 2>/dev/null | grep -i "Wi-Fi is"',
      sensors: 'dumpsys sensorservice 2>/dev/null | grep -m5 "Sensor"',
      installedApps: 'pm list packages -3 2>/dev/null | wc -l',
    };

    const results: Record<string, string> = {};
    for (const [key, cmd] of Object.entries(commands)) {
      try {
        results[key] = execSync(
          `adb -s ${adbTarget} shell ${cmd}`,
          { encoding: 'utf-8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] },
        ).trim();
      } catch {
        results[key] = 'N/A';
      }
    }

    return { deviceId, ...results };
  });
}

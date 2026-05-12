import { useState, useRef, useEffect } from 'react';
import { Terminal, Play, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  deviceId: string;
  tailscaleIp: string;
}

const DANGER_WARNING = '仅支持只读命令。禁止执行 su、reboot、rm -rf 等危险操作。';

export default function AdbConsole({ deviceId, tailscaleIp }: Props) {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleExecute = async () => {
    if (!command.trim() || !tailscaleIp) return;
    setLoading(true);
    setError('');
    setOutput('');

    try {
      const result: any = await api.execAdb(deviceId, tailscaleIp, command.trim());
      setOutput(result.output || result.error || '(no output)');
      if (result.error) setError(result.error);
      setHistory(prev => [command.trim(), ...prev.slice(0, 49)]);
    } catch (err: any) {
      setError(err.message || '命令执行失败');
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleExecute();
    }
  };

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <Terminal size={16} /> ADB 控制台
        </h3>
        <span className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle size={10} /> {DANGER_WARNING}
        </span>
      </div>

      {/* Command input */}
      <div className="flex gap-1.5 mb-2">
        <input
          ref={inputRef}
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="adb shell wm size"
          className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:border-purple-400"
        />
        <button
          onClick={handleExecute}
          disabled={loading || !command.trim()}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          执行
        </button>
      </div>

      {/* Output area */}
      {(output || error) && (
        <div className={`rounded-lg p-3 font-mono text-xs ${
          error ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-gray-900 text-green-400 border border-gray-800'
        }`}>
          <pre className="whitespace-pre-wrap break-all">{error || output}</pre>
        </div>
      )}

      {/* Quick commands */}
      <div className="mt-3 flex flex-wrap gap-1">
        {['wm size', 'wm density', 'dumpsys battery', 'pm list packages -3', 'getprop ro.build.version.release', 'df -h /sdcard'].map(cmd => (
          <button
            key={cmd}
            onClick={() => setCommand(cmd)}
            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-600 font-mono transition-colors"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">历史</span>
          <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
            {history.slice(0, 10).map((cmd, i) => (
              <button
                key={i}
                onClick={() => setCommand(cmd)}
                className="block w-full text-left px-2 py-0.5 hover:bg-gray-50 rounded text-xs text-gray-600 font-mono truncate"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

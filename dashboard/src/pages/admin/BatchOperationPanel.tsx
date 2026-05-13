import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { Play, Square, Camera, Terminal, FileUp, RotateCw, CheckSquare, Square as SquareIcon } from 'lucide-react';

type BatchCommand = 'reboot' | 'lock_screen' | 'unlock_screen' | 'screenshot' | 'shell' | 'deploy_scripts' | 'config_push' | 'start_app' | 'stop_app';

const COMMANDS: { key: BatchCommand; label: string; icon: typeof Play; color: string; needsParams: boolean; paramLabel?: string }[] = [
  { key: 'reboot', label: '重启设备', icon: RotateCw, color: 'text-orange-600', needsParams: false },
  { key: 'lock_screen', label: '锁定屏幕', icon: Square, color: 'text-gray-600', needsParams: false },
  { key: 'unlock_screen', label: '解锁屏幕', icon: Play, color: 'text-green-600', needsParams: false },
  { key: 'screenshot', label: '截图', icon: Camera, color: 'text-blue-600', needsParams: false },
  { key: 'shell', label: 'Shell 命令', icon: Terminal, color: 'text-purple-600', needsParams: true, paramLabel: 'Shell 命令' },
  { key: 'deploy_scripts', label: '部署脚本', icon: FileUp, color: 'text-indigo-600', needsParams: false },
  { key: 'config_push', label: '推送配置', icon: FileUp, color: 'text-cyan-600', needsParams: true, paramLabel: '配置 JSON' },
  { key: 'start_app', label: '启动 APP', icon: Play, color: 'text-green-600', needsParams: true, paramLabel: '包名' },
  { key: 'stop_app', label: '停止 APP', icon: Square, color: 'text-red-600', needsParams: true, paramLabel: '包名' },
];

export default function BatchOperationPanel() {
  const devices = useStore(s => s.devices);
  const loadDevices = useStore(s => s.loadDevices);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCommand, setSelectedCommand] = useState<BatchCommand | null>(null);
  const [params, setParams] = useState('');
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<Array<{ deviceId: string; success: boolean; data?: any; error?: string }>>([]);

  useEffect(() => { loadDevices(); }, []);

  function toggleDevice(id: string) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  }

  function toggleAll() {
    const online = devices.filter(d => d.status === 'online');
    if (selectedIds.size === online.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(online.map(d => d.id)));
  }

  async function execute() {
    if (!selectedCommand) { toast('error', '请选择要执行的命令'); return; }
    if (selectedIds.size === 0) { toast('error', '请至少选择一台在线设备'); return; }
    const cmd = COMMANDS.find(c => c.key === selectedCommand)!;
    if (cmd.needsParams && !params.trim()) { toast('error', `请输入${cmd.paramLabel}`); return; }

    setExecuting(true); setResults([]);
    try {
      const deviceIds = Array.from(selectedIds);
      const res = await api.request('/devices/command/batch', {
        method: 'POST',
        body: JSON.stringify({ deviceIds, command: selectedCommand, params: (() => { try { return params ? JSON.parse(params) : {}; } catch { return {}; } })() }),
      }) as { results: typeof results; succeeded: number; failed: number };
      setResults(res.results || []);
      toast('success', `执行完成: ${res.succeeded} 成功, ${res.failed} 失败`);
    } catch (err: any) {
      toast('error', '批量操作失败');
    } finally { setExecuting(false); }
  }

  const onlineDevices = devices.filter(d => d.status === 'online');

  return (
    <PageWrapper title="批量操作">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device Selection */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-slate-100">选择设备 ({selectedIds.size}/{onlineDevices.length})</h3>
            <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800">{selectedIds.size === onlineDevices.length ? '取消全选' : '全选在线'}</button>
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {onlineDevices.length === 0 && <p className="text-gray-400 dark:text-slate-500 text-sm py-4 text-center">暂无在线设备</p>}
            {onlineDevices.map(d => (
              <label key={d.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer">
                <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleDevice(d.id)} />
                <div>
                  <div className="text-sm text-gray-900 dark:text-slate-100">{d.name || d.id}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">{d.model}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Command Panel */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-3">选择命令</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {COMMANDS.map(cmd => (
              <button key={cmd.key} onClick={() => setSelectedCommand(cmd.key)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-all ${selectedCommand === cmd.key ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600 text-gray-600 dark:text-slate-400'}`}>
                <cmd.icon size={18} className={cmd.color} />
                <span>{cmd.label}</span>
              </button>
            ))}
          </div>

          {selectedCommand && COMMANDS.find(c => c.key === selectedCommand)?.needsParams && (
            <div className="mb-4">
              <label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">{COMMANDS.find(c => c.key === selectedCommand)!.paramLabel}</label>
              <textarea value={params} onChange={e => setParams(e.target.value)} rows={3} placeholder={`输入${COMMANDS.find(c => c.key === selectedCommand)!.paramLabel}...`}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg text-sm font-mono resize-none focus:outline-none focus:border-blue-400" />
            </div>
          )}

          <button onClick={execute} disabled={executing || !selectedCommand || selectedIds.size === 0}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {executing ? (
              <span className="flex items-center gap-2"><RotateCw size={16} className="animate-spin" /> 执行中...</span>
            ) : `执行 (${selectedIds.size} 台设备)`}
          </button>

          {/* Results */}
          {results.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">执行结果</h4>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {results.map(r => (
                  <div key={r.deviceId} className={`flex items-center gap-2 p-2 rounded text-sm ${r.success ? 'bg-green-50 dark:bg-green-900/30 text-green-700' : 'bg-red-50 dark:bg-red-900/20 text-red-700'}`}>
                    {r.success ? <CheckSquare size={14} /> : <SquareIcon size={14} />}
                    <span className="truncate">{r.deviceId}</span>
                    {r.error && <span className="text-xs ml-auto">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}

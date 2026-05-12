import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { Bell, BellOff, Plus, Trash2, Play, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  durationMs: number;
  channels: string[];
  enabled: boolean;
  createdAt: number;
}

interface AlertHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  message: string;
  value: number;
  threshold: number;
  status: 'firing' | 'resolved';
  firedAt: number;
  resolvedAt?: number;
}

const METRIC_OPTIONS: { value: string; label: string }[] = [
  { value: 'device.offline_duration', label: '设备离线时长' },
  { value: 'task.failure_rate', label: '任务失败率' },
  { value: 'activation.expiring', label: '卡密即将到期' },
  { value: 'device.storage_low', label: '存储空间不足' },
  { value: 'device.cpu_high', label: 'CPU 使用过高' },
  { value: 'device.memory_high', label: '内存使用过高' },
  { value: 'device.battery_low', label: '设备电量过低' },
];

const CHANNEL_OPTIONS = [
  { value: 'dashboard', label: '面板通知' },
  { value: 'websocket', label: 'WebSocket' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'notification', label: '推送通知' },
];

const DEFAULT_RULE: Partial<AlertRule> = {
  name: '', metric: 'device.offline_duration', operator: 'gt', threshold: 5,
  durationMs: 300000, channels: ['dashboard'], enabled: true,
};

export default function AlertRuleConfig() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<AlertRule>>({ ...DEFAULT_RULE });
  const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');

  useEffect(() => { loadRules(); loadHistory(); }, []);

  async function loadRules() {
    setLoading(true);
    try { const res = await api.request('/alerts/rules') as { rules: AlertRule[] }; setRules(res.rules || []); }
    catch { toast('error', '加载告警规则失败'); } finally { setLoading(false); }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try { const res = await api.request('/alerts/history?limit=50') as { history: AlertHistory[] }; setHistory(res.history || []); }
    catch { /* silent */ } finally { setHistoryLoading(false); }
  }

  async function handleSave() {
    if (!editingRule.name) { toast('error', '请输入规则名称'); return; }
    try {
      if (editingRule.id) {
        await api.request(`/alerts/rules/${editingRule.id}`, { method: 'PATCH', body: JSON.stringify(editingRule) });
      } else {
        await api.request('/alerts/rules', { method: 'POST', body: JSON.stringify(editingRule) });
      }
      toast('success', '规则已保存');
      setShowModal(false); await loadRules();
    } catch { toast('error', '保存失败'); }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这条规则？')) return;
    try { await api.request(`/alerts/rules/${id}`, { method: 'DELETE' }); toast('success', '规则已删除'); await loadRules(); }
    catch { toast('error', '删除失败'); }
  }

  async function handleToggle(rule: AlertRule) {
    try {
      await api.request(`/alerts/rules/${rule.id}/toggle`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
      toast('success', rule.enabled ? '已禁用' : '已启用');
      await loadRules();
    } catch { toast('error', '操作失败'); }
  }

  function formatDuration(ms: number): string {
    if (ms < 60_000) return `${ms / 1000} 秒`;
    if (ms < 3_600_000) return `${ms / 60_000} 分钟`;
    return `${ms / 3_600_000} 小时`;
  }

  return (
    <PageWrapper title="告警规则">
      {/* Tab Switch */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('rules')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'rules' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
          规则配置 ({rules.length})
        </button>
        <button onClick={() => setActiveTab('history')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
          告警历史 ({history.length})
        </button>
      </div>

      {activeTab === 'rules' ? (
        <>
          <button onClick={() => { setEditingRule({ ...DEFAULT_RULE }); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm mb-4 hover:bg-blue-700">
            <Plus size={14} /> 新增规则
          </button>

          {loading ? <p className="text-gray-400 text-center py-8">加载中...</p> :
           rules.length === 0 ? <p className="text-gray-400 text-center py-8">暂无告警规则</p> :
           <div className="space-y-3">
            {rules.map(rule => (
            <div key={rule.id} className={`bg-white rounded-xl border p-4 transition-all ${rule.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{rule.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${rule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {rule.enabled ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {METRIC_OPTIONS.find(m => m.value === rule.metric)?.label || rule.metric}
                    {' '}{rule.operator === 'gt' ? '>' : rule.operator === 'lt' ? '<' : rule.operator}{' '}
                    <span className="font-mono font-medium text-gray-700">{rule.threshold}</span>
                    {' · 持续 '}{formatDuration(rule.durationMs)}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {rule.channels.map(ch => (
                      <span key={ch} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{CHANNEL_OPTIONS.find(c => c.value === ch)?.label || ch}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggle(rule)} className="p-1.5 hover:bg-gray-100 rounded" title={rule.enabled ? '禁用' : '启用'}>
                    {rule.enabled ? <BellOff size={14} /> : <Bell size={14} />}
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
           ))}</div>
          }
        </>
      ) : (
        <>
          {historyLoading ? <p className="text-gray-400 text-center py-8">加载中...</p> :
           history.length === 0 ? <p className="text-gray-400 text-center py-8">暂无告警历史</p> :
           <div className="space-y-2">
            {history.map(h => (
            <div key={h.id} className={`bg-white rounded-lg border p-3 flex items-center gap-3 ${h.status === 'firing' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              {h.status === 'firing' ? <XCircle size={18} className="text-red-500 shrink-0" /> : <CheckCircle2 size={18} className="text-green-500 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{h.message}</div>
                <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                  <Clock size={12} /> {new Date(h.firedAt).toLocaleString('zh-CN')}
                  {h.resolvedAt && <span>→ {new Date(h.resolvedAt).toLocaleString('zh-CN')}</span>}
                </div>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${h.status === 'firing' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {h.status === 'firing' ? '触发中' : '已解除'}
              </span>
            </div>
           ))}</div>
          }
        </>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingRule.id ? '编辑规则' : '新增规则'}</h3>
            <div className="space-y-3">
              <div><label className="block text-sm text-gray-600 mb-1">规则名称</label><input value={editingRule.name || ''} onChange={e => setEditingRule(r => ({ ...r, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">监控指标</label>
                <select value={editingRule.metric} onChange={e => setEditingRule(r => ({ ...r, metric: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  {METRIC_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm text-gray-600 mb-1">条件</label>
                  <select value={editingRule.operator} onChange={e => setEditingRule(r => ({ ...r, operator: e.target.value as any }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="gt">大于 (&gt;)</option><option value="lt">小于 (&lt;)</option><option value="gte">大于等于 (&gt;=)</option><option value="lte">小于等于 (&lt;=)</option><option value="eq">等于 (=)</option>
                  </select>
                </div>
                <div><label className="block text-sm text-gray-600 mb-1">阈值</label><input type="number" value={editingRule.threshold} onChange={e => setEditingRule(r => ({ ...r, threshold: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">持续时间 (毫秒)</label><input type="number" value={editingRule.durationMs} onChange={e => setEditingRule(r => ({ ...r, durationMs: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">通知渠道</label>
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_OPTIONS.map(c => (
                    <label key={c.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={editingRule.channels?.includes(c.value)} onChange={e => {
                        setEditingRule(r => ({ ...r, channels: e.target.checked ? [...(r.channels || []), c.value] : (r.channels || []).filter(ch => ch !== c.value) }));
                      }} /> {c.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">保存</button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

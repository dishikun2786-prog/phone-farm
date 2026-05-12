import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { TrendingUp, DollarSign, Zap, Hash } from 'lucide-react';

interface VlmUsageStats {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { calls: number; tokens: number; costUsd: number }>;
  byDevice: Record<string, { calls: number; tokens: number }>;
  byDay: Record<string, { calls: number; tokens: number }>;
}

export default function VlmUsageDashboard() {
  const [stats, setStats] = useState<VlmUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [sortModel, setSortModel] = useState<'calls' | 'tokens' | 'cost'>('calls');

  useEffect(() => { loadStats(); }, [days]);

  async function loadStats() {
    setLoading(true);
    try {
      const to = Date.now();
      const from = to - days * 24 * 3600 * 1000;
      const res = await api.request(`/stats/vlm-usage?from=${from}&to=${to}`) as VlmUsageStats;
      setStats(res);
    } catch { toast('error', '加载 VLM 用量统计失败'); }
    finally { setLoading(false); }
  }

  if (loading) return <PageWrapper title="VLM 用量统计"><p className="text-gray-400 dark:text-slate-500 text-center py-12">加载中...</p></PageWrapper>;
  if (!stats) return <PageWrapper title="VLM 用量统计"><p className="text-gray-400 dark:text-slate-500 text-center py-12">暂无数据</p></PageWrapper>;

  const modelEntries = Object.entries(stats.byModel).sort((a, b) => {
    if (sortModel === 'calls') return b[1].calls - a[1].calls;
    if (sortModel === 'tokens') return b[1].tokens - a[1].tokens;
    return b[1].costUsd - a[1].costUsd;
  });

  const dayEntries = Object.entries(stats.byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxDayCalls = Math.max(...dayEntries.map(d => d[1].calls), 1);

  const deviceEntries = Object.entries(stats.byDevice).sort((a, b) => b[1].calls - a[1].calls);

  return (
    <PageWrapper title="VLM 用量统计">
      {/* Period Selector */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm ${days === d ? 'bg-blue-600 text-white' : 'border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
            {d === 1 ? '今日' : `近 ${d} 天`}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Zap size={16} /><span className="text-xs">总调用次数</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.totalCalls.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Hash size={16} /><span className="text-xs">总 Token 消耗</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.totalTokens >= 1_000_000 ? (stats.totalTokens / 1_000_000).toFixed(1) + 'M' : stats.totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><DollarSign size={16} /><span className="text-xs">总费用 (USD)</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">${stats.totalCostUsd.toFixed(4)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><TrendingUp size={16} /><span className="text-xs">日均调用</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{(stats.totalCalls / Math.max(days, 1)).toFixed(0)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Model */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">按模型分布</h3>
            <select value={sortModel} onChange={e => setSortModel(e.target.value as any)}
              className="px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-xs bg-white dark:bg-slate-700 dark:text-slate-100">
              <option value="calls">按调用次数</option>
              <option value="tokens">按 Token</option>
              <option value="cost">按费用</option>
            </select>
          </div>
          {modelEntries.length === 0 ? (
            <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-8">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {modelEntries.map(([model, data]) => (
                <div key={model} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-slate-700">
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{model}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{data.calls} 次调用 · {(data.tokens / 1000).toFixed(0)}K tokens</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">${data.costUsd.toFixed(4)}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{((data.calls / stats.totalCalls) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Device */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-sm mb-3">按设备分布 (Top 10)</h3>
          {deviceEntries.length === 0 ? (
            <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-8">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {deviceEntries.slice(0, 10).map(([deviceId, data]) => (
                <div key={deviceId} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-slate-700">
                  <div className="text-sm text-gray-900 dark:text-slate-100 font-mono truncate max-w-[200px]">{deviceId}</div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{data.calls} 次</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{(data.tokens / 1000).toFixed(0)}K tokens</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Daily Chart (Simple Bar) */}
      <div className="mt-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <h3 className="font-semibold text-sm mb-3">每日调用量</h3>
        {dayEntries.length === 0 ? (
          <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-8">暂无数据</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {dayEntries.map(([day, data]) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-1" title={`${day}: ${data.calls} 次`}>
                <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">{data.calls}</span>
                <div className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors"
                  style={{ height: `${(data.calls / maxDayCalls) * 120}px`, minHeight: data.calls > 0 ? 4 : 0 }} />
                <span className="text-xs text-gray-400 dark:text-slate-500">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { MessageSquare, Brain, Eye, Coins, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface AssistantUsageStats {
  totalSessions: number;
  totalSteps: number;
  totalBrainCalls: number;
  totalVisionCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCreditsConsumed: number;
  avgStepsPerSession: number;
  avgDurationMs: number;
  successRate: number;
  byModel: Record<string, { calls: number; tokens: number; creditsConsumed: number }>;
  byDevice: Record<string, { sessions: number; steps: number; creditsConsumed: number }>;
  byDay: Record<string, { sessions: number; steps: number; creditsConsumed: number }>;
  recentErrors: Array<{ sessionId: string; deviceId: string; error: string; at: string }>;
}

export default function AssistantUsageDashboard() {
  const [stats, setStats] = useState<AssistantUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => { loadStats(); }, [days]);

  async function loadStats() {
    setLoading(true);
    try {
      const to = Date.now();
      const from = to - days * 24 * 3600 * 1000;
      const data = await api.request(`/stats/assistant-usage?from=${from}&to=${to}`) as AssistantUsageStats;
      setStats(data);
    } catch {
      toast('error', '加载 AI 助手用量统计失败');
    }
    finally { setLoading(false); }
  }

  if (loading) return <PageWrapper title="AI 助手用量"><p className="text-gray-400 dark:text-slate-500 text-center py-12">加载中...</p></PageWrapper>;
  if (!stats) return <PageWrapper title="AI 助手用量"><p className="text-gray-400 dark:text-slate-500 text-center py-12">暂无数据</p></PageWrapper>;

  const dayEntries = Object.entries(stats.byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxDaySessions = Math.max(...dayEntries.map(d => d[1].sessions), 1);
  const modelEntries = Object.entries(stats.byModel).sort((a, b) => b[1].calls - a[1].calls);
  const deviceEntries = Object.entries(stats.byDevice).sort((a, b) => b[1].sessions - a[1].sessions);

  return (
    <PageWrapper title="AI 助手用量">
      {/* Period Selector */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm ${days === d ? 'bg-blue-600 text-white' : 'border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300'}`}>
            {d === 1 ? '今日' : `近 ${d} 天`}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><MessageSquare size={16} /><span className="text-xs">总会话数</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.totalSessions.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Brain size={16} /><span className="text-xs">Brain 调用</span></div>
          <div className="text-2xl font-bold text-purple-600">{stats.totalBrainCalls.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Eye size={16} /><span className="text-xs">Vision 调用</span></div>
          <div className="text-2xl font-bold text-cyan-600">{stats.totalVisionCalls.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Coins size={16} /><span className="text-xs">积分消耗</span></div>
          <div className="text-2xl font-bold text-orange-600">{stats.totalCreditsConsumed.toLocaleString()}</div>
        </div>
      </div>

      {/* Second Row — Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><CheckCircle size={16} className="text-green-500" /><span className="text-xs">成功率</span></div>
          <div className="text-2xl font-bold text-green-600">{(stats.successRate * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Clock size={16} /><span className="text-xs">平均耗时</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{formatDuration(stats.avgDurationMs)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><MessageSquare size={16} /><span className="text-xs">平均步骤/会话</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.avgStepsPerSession.toFixed(1)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Coins size={16} /><span className="text-xs">Token 总量</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{stats.totalInputTokens + stats.totalOutputTokens >= 1_000_000 ? ((stats.totalInputTokens + stats.totalOutputTokens) / 1_000_000).toFixed(1) + 'M' : (stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Model */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-slate-100">按模型分布</h3>
          {modelEntries.length === 0 ? (
            <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-8">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {modelEntries.map(([model, data]) => (
                <div key={model} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-slate-700">
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-slate-100 font-mono">{model}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{data.calls} 次调用 · {(data.tokens / 1000).toFixed(0)}K tokens</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-orange-600">{data.creditsConsumed.toLocaleString()} 积分</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{((data.calls / Math.max(stats.totalBrainCalls + stats.totalVisionCalls, 1)) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Device */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-slate-100">按设备分布 (Top 10)</h3>
          {deviceEntries.length === 0 ? (
            <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-8">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {deviceEntries.slice(0, 10).map(([deviceId, data]) => (
                <div key={deviceId} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-slate-700">
                  <div className="text-sm text-gray-900 dark:text-slate-100 font-mono truncate max-w-[200px]">{deviceId}</div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{data.sessions} 会话</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500">{data.steps} 步 · {data.creditsConsumed.toLocaleString()} 积分</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Daily Chart */}
      <div className="mt-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-slate-100">每日会话量</h3>
        {dayEntries.length === 0 ? (
          <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-8">暂无数据</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {dayEntries.map(([day, data]) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-1" title={`${day}: ${data.sessions} 会话, ${data.creditsConsumed.toLocaleString()} 积分`}>
                <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">{data.sessions}</span>
                <div className="w-full bg-purple-500 rounded-t hover:bg-purple-600 transition-colors"
                  style={{ height: `${(data.sessions / maxDaySessions) * 120}px`, minHeight: data.sessions > 0 ? 4 : 0 }} />
                <span className="text-xs text-gray-400 dark:text-slate-500">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Errors */}
      {stats.recentErrors && stats.recentErrors.length > 0 && (
        <div className="mt-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
            <AlertCircle size={16} className="text-red-500" /> 最近错误
          </h3>
          <div className="space-y-2">
            {stats.recentErrors.slice(0, 5).map((err, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10">
                <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-gray-900 dark:text-slate-100 truncate">{err.error}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    设备: <span className="font-mono">{err.deviceId}</span> · 会话: <span className="font-mono">{err.sessionId?.slice(0, 12)}...</span> · {new Date(err.at).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remainSec = Math.round(sec % 60);
  return `${min}m ${remainSec}s`;
}

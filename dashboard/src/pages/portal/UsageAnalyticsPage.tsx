import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import UsageGauge from '../../components/portal/UsageGauge';

interface UsageData {
  aggregated: Record<string, number>;
  daily: Record<string, Record<string, number>>;
  limits: { maxDevices: number; maxVlmCallsPerDay: number; maxScriptExecutionsPerDay: number } | null;
}

export default function UsageAnalyticsPage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    const to = Date.now();
    const from = to - days * 24 * 3600 * 1000;
    api.portalGetUsage({ from, to })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-400">无法加载用量数据</div>;
  }

  const dailyKeys = Object.keys(data.daily).sort();

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">用量统计</h1>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value={7}>最近 7 天</option>
          <option value={30}>最近 30 天</option>
          <option value={90}>最近 90 天</option>
        </select>
      </div>

      {/* Gauges */}
      {data.limits && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <UsageGauge label="VLM 调用" used={data.aggregated.vlm_call || 0} limit={data.limits.maxVlmCallsPerDay} unit="次" />
          <UsageGauge label="脚本执行" used={data.aggregated.script_execution || 0} limit={data.limits.maxScriptExecutionsPerDay} unit="次" />
          <UsageGauge label="设备数" used={0} limit={data.limits.maxDevices} unit="台" />
        </div>
      )}

      {/* Daily chart */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-semibold mb-4">每日趋势</h2>
        {dailyKeys.length === 0 ? (
          <p className="text-sm text-gray-400">暂无数据</p>
        ) : (
          <div className="space-y-1">
            {dailyKeys.map((day) => {
              const vals = data.daily[day];
              const vlm = vals.vlm_call || 0;
              const script = vals.script_execution || 0;
              const maxVal = data.limits?.maxVlmCallsPerDay || 100;
              const pct = Math.min(vlm / maxVal, 1);
              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-24">{day.slice(5)}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded transition-all"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-20 text-right">VLM: {vlm}</span>
                  <span className="text-xs text-gray-400 w-20 text-right">脚本: {script}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary table */}
      <div className="bg-white border rounded-lg p-6 mt-6">
        <h2 className="font-semibold mb-4">用量汇总</h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(data.aggregated).map(([key, val]) => (
            <div key={key} className="flex justify-between py-2 border-b last:border-b-0">
              <span className="text-sm text-gray-500">{key}</span>
              <span className="text-sm font-medium">{val}</span>
            </div>
          ))}
          {Object.keys(data.aggregated).length === 0 && (
            <p className="text-sm text-gray-400 col-span-2">所选时间段内无用量的记录</p>
          )}
        </div>
      </div>
    </div>
  );
}

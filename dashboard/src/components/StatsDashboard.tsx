import { useEffect } from 'react';
import { useStore } from '../store';
import {
  Bot, CheckCircle2, TrendingUp, DollarSign,
  BarChart3, Activity, Loader2
} from 'lucide-react';

const PLATFORM_NAMES: Record<string, string> = {
  dy: '抖音', ks: '快手', wx: '微信', xhs: '小红书',
};

const PLATFORM_COLORS: Record<string, string> = {
  dy: 'bg-pink-500', ks: 'bg-orange-500', wx: 'bg-green-500', xhs: 'bg-red-500',
};

export default function StatsDashboard() {
  const stats = useStore(s => s.stats);
  const statsLoading = useStore(s => s.statsLoading);
  const loadStats = useStore(s => s.loadStats);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-purple-500" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-20 text-gray-400">
        <BarChart3 size={48} className="mx-auto mb-3 text-gray-300" />
        <p className="text-lg">暂无统计数据</p>
        <p className="text-sm mt-1">执行 VLM 任务后统计数据将在此显示</p>
      </div>
    );
  }

  const maxPlatformCount = Math.max(...stats.episodesByPlatform.map(p => p.count), 1);
  const successRates = stats.successRateOverTime;
  const maxRate = Math.max(...successRates.map(s => s.rate), 100);
  const maxScriptUsage = Math.max(...stats.topScripts.map(s => s.usageCount), 1);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <BarChart3 size={24} className="text-purple-600" />
        VLM 数据统计
      </h2>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Bot size={20} />}
          label="总任务数"
          value={stats.totalEpisodes.toString()}
          color="text-purple-600"
          bg="bg-purple-50"
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          label="成功率"
          value={`${stats.successRate.toFixed(1)}%`}
          color={stats.successRate >= 80 ? 'text-green-600' : stats.successRate >= 50 ? 'text-yellow-600' : 'text-red-600'}
          bg={stats.successRate >= 80 ? 'bg-green-50' : stats.successRate >= 50 ? 'bg-yellow-50' : 'bg-red-50'}
        />
        <StatCard
          icon={<TrendingUp size={20} />}
          label="平均步数/任务"
          value={stats.avgStepsPerTask.toFixed(1)}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          icon={<DollarSign size={20} />}
          label="预估 VLM 成本"
          value={`$${stats.totalVLMCost.toFixed(4)}`}
          color="text-orange-600"
          bg="bg-orange-50"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart: Episodes by Platform */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Activity size={16} />
            各平台 Episode 数量
          </h3>
          {stats.episodesByPlatform.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">暂无数据</p>
          ) : (
            <div className="space-y-3">
              {stats.episodesByPlatform.map(item => {
                const pct = (item.count / maxPlatformCount) * 100;
                return (
                  <div key={item.platform} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-12 shrink-0">
                      {PLATFORM_NAMES[item.platform] || item.platform}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${PLATFORM_COLORS[item.platform] || 'bg-gray-400'}`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 w-8 text-right font-medium">{item.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Line Chart: Success Rate Over Time */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <TrendingUp size={16} />
            成功率趋势
          </h3>
          {successRates.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">暂无数据</p>
          ) : (
            <div className="relative h-48">
              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[10px] text-gray-400">
                <span>{maxRate}%</span>
                <span>{Math.round(maxRate / 2)}%</span>
                <span>0%</span>
              </div>
              {/* Chart area */}
              <div className="ml-10 h-full relative border-l-2 border-b-2 border-gray-200">
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div className="border-t border-gray-100 h-0" />
                  <div className="border-t border-gray-100 h-0" />
                  <div className="border-t border-gray-100 h-0" />
                </div>
                {/* Data points and connecting lines using SVG */}
                <svg
                  className="absolute inset-0"
                  viewBox={`0 0 100 100`}
                  preserveAspectRatio="none"
                >
                  {successRates.length > 1 && (
                    <polyline
                      points={successRates.map((s, i) => {
                        const x = (i / Math.max(successRates.length - 1, 1)) * 100;
                        const y = 100 - (s.rate / Math.max(maxRate, 1)) * 100;
                        return `${x},${y}`;
                      }).join(' ')}
                      fill="none"
                      stroke="rgb(147 51 234)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
                {/* Data points */}
                {successRates.map((s, i) => {
                  const left = (i / Math.max(successRates.length - 1, 1)) * 100;
                  const bottom = (s.rate / Math.max(maxRate, 1)) * 100;
                  return (
                    <div
                      key={i}
                      className="absolute group -translate-x-1/2"
                      style={{ left: `${left}%`, bottom: `${bottom}%` }}
                    >
                      <div className="w-2 h-2 rounded-full bg-purple-600 border border-white shadow-sm" />
                      {/* Tooltip */}
                      <div className="hidden group-hover:block absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        {s.date}: {s.rate.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
                {/* X-axis labels */}
                <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-[10px] text-gray-400">
                  {successRates.length > 0 && (
                    <>
                      <span>{successRates[0].date}</span>
                      {successRates.length > 1 && (
                        <span>{successRates[successRates.length - 1].date}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Scripts */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Bot size={16} />
          热门编译脚本 (按使用次数)
        </h3>
        {stats.topScripts.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">暂无编译脚本</p>
        ) : (
          <div className="space-y-2">
            {stats.topScripts.map((script, idx) => {
              const pct = (script.usageCount / maxScriptUsage) * 100;
              const rankColors = [
                'bg-yellow-100 text-yellow-700',
                'bg-gray-100 text-gray-600',
                'bg-orange-100 text-orange-700',
              ];
              return (
                <div key={script.id} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    idx < 3 ? rankColors[idx] : 'text-gray-400'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{script.name}</span>
                  <div className="w-48 bg-gray-100 rounded-full h-4 overflow-hidden shrink-0 hidden md:block">
                    <div
                      className="h-full rounded-full bg-purple-500 transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right font-medium">
                    {script.usageCount} 次
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, color, bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${bg} ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

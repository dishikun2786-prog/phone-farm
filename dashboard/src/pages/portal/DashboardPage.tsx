import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import UsageGauge from '../../components/portal/UsageGauge';

interface PortalDashboard {
  deviceCount: number;
  taskCount: number;
  todayUsage: Record<string, number>;
  subscription: { status: string; currentPeriodEnd: string } | null;
  plan: { name: string; tier: string; maxDevices: number; maxVlmCallsPerDay: number; maxScriptExecutionsPerDay: number } | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.request('/api/v2/portal/dashboard')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-400">无法加载门户数据</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">门户首页</h1>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-3xl font-bold text-blue-600">{data.deviceCount}</div>
          <div className="text-sm text-gray-500">在线设备</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-3xl font-bold text-green-600">{data.taskCount}</div>
          <div className="text-sm text-gray-500">活跃任务</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-3xl font-bold text-purple-600">{data.todayUsage?.vlm_call || 0}</div>
          <div className="text-sm text-gray-500">今日 VLM 调用</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-3xl font-bold text-orange-600">{data.todayUsage?.script_execution || 0}</div>
          <div className="text-sm text-gray-500">今日脚本执行</div>
        </div>
      </div>

      {/* Subscription status */}
      {data.subscription && data.plan && (
        <div className="bg-white border rounded-lg p-6 mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">{data.plan.name} 套餐</h2>
              <p className="text-sm text-gray-500">
                {data.subscription.status === 'active' ? '生效中' : data.subscription.status}
                {data.subscription.currentPeriodEnd && ` · 到期: ${new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}`}
              </p>
            </div>
            <button
              onClick={() => navigate('/portal/plans')}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
            >
              升级套餐
            </button>
          </div>
        </div>
      )}

      {/* Usage gauges */}
      {data.plan && (
        <div>
          <h2 className="text-lg font-semibold mb-4">今日用量</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UsageGauge
              label="设备数"
              used={data.deviceCount}
              limit={data.plan.maxDevices}
              unit="台"
            />
            <UsageGauge
              label="VLM 调用"
              used={data.todayUsage?.vlm_call || 0}
              limit={data.plan.maxVlmCallsPerDay}
              unit="次"
            />
            <UsageGauge
              label="脚本执行"
              used={data.todayUsage?.script_execution || 0}
              limit={data.plan.maxScriptExecutionsPerDay}
              unit="次"
            />
          </div>
        </div>
      )}

      {!data.subscription && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-700 mb-4">您尚未订阅任何套餐</p>
          <button
            onClick={() => navigate('/portal/plans')}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            查看套餐
          </button>
        </div>
      )}
    </div>
  );
}

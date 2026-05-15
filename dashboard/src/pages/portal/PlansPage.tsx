import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

interface Plan {
  id: string;
  name: string;
  tier: string;
  monthlyPriceCents: number;
  maxDevices: number;
  maxVlmCallsPerDay: number;
  maxScriptExecutionsPerDay: number;
  includesScreenStream: boolean;
  includesVlmAgent: boolean;
  includesPrioritySupport: boolean;
  features: string[];
  monthlyAssistantCredits: number;
}

const FEATURE_LABELS: Record<string, string> = {
  activation: '设备激活',
  basic_vlm: '基础 VLM AI',
  advanced_vlm: '高级 VLM AI',
  script_execution: '脚本执行',
  screen_stream: '屏幕实时流',
  api_access: '开放 API 访问',
  priority_support: '优先技术支持',
  white_label: '白标自定义品牌',
  dedicated_agent: '专属代理商',
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.getBillingPlans()
      .then((data: any) => setPlans(data.plans || data || []))
      .catch((err: any) => setError(err.message || '加载套餐失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">选择套餐</h1>
      <p className="text-gray-500 mb-8">选择适合您业务规模的套餐计划</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`border rounded-xl p-6 flex flex-col ${
              plan.tier === 'pro' ? 'border-blue-500 shadow-lg ring-2 ring-blue-100' : 'border-gray-200'
            }`}
          >
            {plan.tier === 'pro' && (
              <span className="bg-blue-500 text-white text-xs px-3 py-1 rounded-full self-start mb-3">推荐</span>
            )}
            <h2 className="text-xl font-bold">{plan.name}</h2>
            <div className="mt-4 mb-6">
              <span className="text-4xl font-bold">{(plan.monthlyPriceCents / 100).toFixed(0)}</span>
              <span className="text-gray-400"> 元/月</span>
            </div>

            <ul className="space-y-3 flex-1 mb-6">
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> 最多 {plan.maxDevices} 台设备
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> 每日 {plan.maxVlmCallsPerDay} 次 VLM 调用
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> 每日 {plan.maxScriptExecutionsPerDay} 次脚本执行
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> {plan.monthlyAssistantCredits} AI 助手积分/月
              </li>
              {plan.includesScreenStream && (
                <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> 屏幕实时流</li>
              )}
              {plan.includesVlmAgent && (
                <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> VLM AI 代理</li>
              )}
              {plan.includesPrioritySupport && (
                <li className="flex items-center gap-2"><span className="text-green-500">&#10003;</span> 优先技术支持</li>
              )}
              {plan.features.map((f) => {
                const label = FEATURE_LABELS[f];
                if (!label) return null;
                return (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-green-500">&#10003;</span> {label}
                  </li>
                );
              })}
            </ul>

            <button
              onClick={() => navigate(`/portal/subscribe?plan=${plan.id}`)}
              disabled={plan.monthlyPriceCents === 0}
              className={`w-full py-3 rounded-lg font-medium ${
                plan.tier === 'pro'
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : plan.monthlyPriceCents === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {plan.monthlyPriceCents === 0 ? '当前套餐' : '立即订阅'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

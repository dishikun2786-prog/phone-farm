import { useState } from 'react';
import { api } from '../../lib/api';

export default function CardKeyGeneratePage() {
  const [count, setCount] = useState(10);
  const [planId, setPlanId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);

  const loadPlans = () => {
    api.getBillingPlans().then((data) => {
      setPlans(data.plans || []);
      setPlansLoaded(true);
      if (data.plans?.length > 0 && !planId) setPlanId(data.plans[0].id);
    }).catch(() => {});
  };

  if (!plansLoaded) loadPlans();

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const data = await api.request('/api/v2/card-batches', {
        method: 'POST',
        body: JSON.stringify({ count, planId: planId || undefined }),
      });
      setResult(data.codes || []);
    } catch (err: any) {
      setError(err.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">生成卡密</h1>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">关联套餐</label>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">不限套餐</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">生成数量</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium"
        >
          {generating ? '生成中...' : `生成 ${count} 张卡密`}
        </button>

        {result && result.length > 0 && (
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-sm">已生成 {result.length} 张卡密</h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(result.join('\n'));
                }}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                一键复制
              </button>
            </div>
            <div className="bg-gray-50 border rounded-lg p-3 max-h-64 overflow-y-auto">
              {result.map((code, i) => (
                <div key={i} className="font-mono text-xs py-0.5 text-gray-700">{code}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

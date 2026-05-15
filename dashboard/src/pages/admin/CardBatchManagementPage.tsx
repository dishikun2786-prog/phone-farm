import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface CardBatch {
  id: string;
  name: string;
  agentId: string;
  planId: string;
  count: number;
  days: number;
  maxDevices: number;
  wholesalePriceCents: number;
  retailPriceCents: number;
  createdBy: string;
  note: string;
  createdAt: string;
}

export default function CardBatchManagementPage() {
  const [batches, setBatches] = useState<CardBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [count, setCount] = useState(100);
  const [days, setDays] = useState(365);
  const [maxDevices, setMaxDevices] = useState(1);
  const [wholesaleCents, setWholesaleCents] = useState(0);
  const [retailCents, setRetailCents] = useState(0);
  const [note, setNote] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.request('/api/v2/card-batches')
      .then((data) => setBatches(data.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true); setError('');
    try {
      const data = await api.request('/api/v2/card-batches', {
        method: 'POST',
        body: JSON.stringify({
          name, count, days, maxDevices,
          wholesalePriceCents: wholesaleCents,
          retailPriceCents: retailCents,
          note: note || undefined,
        }),
      });
      setGeneratedCodes(data.codes || []);
      setShowGenerate(false);
      load();
    } catch (err: any) { setError(err.message || '生成失败'); }
    finally { setGenerating(false); }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">卡密批次管理</h1>
        <button
          onClick={() => { setShowGenerate(true); setGeneratedCodes(null); setError(''); }}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
        >
          生成新批次
        </button>
      </div>

      {generatedCodes && generatedCodes.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <p className="text-green-800 font-medium text-sm">成功生成 {generatedCodes.length} 张卡密</p>
            <button
              onClick={() => navigator.clipboard.writeText(generatedCodes.join('\n'))}
              className="text-xs text-green-600 hover:text-green-800"
            >
              一键复制全部
            </button>
          </div>
          <div className="bg-white border rounded-lg p-3 max-h-60 overflow-y-auto">
            {generatedCodes.map((code, i) => (
              <div key={i} className="font-mono text-xs py-0.5 text-gray-700">{code}</div>
            ))}
          </div>
        </div>
      )}

      {showGenerate && (
        <div className="bg-white border rounded-lg p-6 mb-6 space-y-4">
          <h2 className="font-semibold">生成新批次</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">批次名称</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如: 2026年5月促销" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">生成数量</label>
              <input type="number" min={1} max={10000} value={count} onChange={(e) => setCount(Math.min(10000, Math.max(1, Number(e.target.value) || 1)))} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">有效天数</label>
              <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value) || 365)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">最大设备数</label>
              <input type="number" min={1} max={100} value={maxDevices} onChange={(e) => setMaxDevices(Number(e.target.value) || 1)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">批发价 (分)</label>
              <input type="number" min={0} value={wholesaleCents} onChange={(e) => setWholesaleCents(Number(e.target.value) || 0)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">零售价 (分)</label>
              <input type="number" min={0} value={retailCents} onChange={(e) => setRetailCents(Number(e.target.value) || 0)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">备注</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowGenerate(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
            <button
              onClick={handleGenerate}
              disabled={generating || !name.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {generating ? '生成中...' : `生成 ${count} 张卡密`}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">批次名称</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">数量</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">有效期</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">设备数/张</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">批发价</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">零售价</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">{b.name}</p>
                  {b.note && <p className="text-xs text-gray-400">{b.note}</p>}
                </td>
                <td className="px-4 py-3 text-sm font-medium">{b.count}</td>
                <td className="px-4 py-3 text-sm">{b.days} 天</td>
                <td className="px-4 py-3 text-sm">{b.maxDevices}</td>
                <td className="px-4 py-3 text-sm">{(b.wholesalePriceCents / 100).toFixed(2)} 元</td>
                <td className="px-4 py-3 text-sm">{(b.retailPriceCents / 100).toFixed(2)} 元</td>
                <td className="px-4 py-3 text-sm text-gray-400">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">暂无卡密批次</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

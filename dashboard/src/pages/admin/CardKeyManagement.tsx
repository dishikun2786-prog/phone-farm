import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { Key, Plus, Download, Ban, Search, Copy, Check, X } from 'lucide-react';

interface CardKey {
  id: string;
  code: string;
  days: number;
  maxDevices: number;
  usedDevices: number;
  status: 'active' | 'used' | 'expired' | 'disabled';
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  note?: string;
}

export default function CardKeyManagement() {
  const [keys, setKeys] = useState<CardKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateForm, setGenerateForm] = useState({ count: 10, days: 365, maxDevices: 1, prefix: '', note: '' });
  const [generating, setGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<CardKey[]>([]);

  useEffect(() => { loadKeys(); }, []);

  async function loadKeys() {
    setLoading(true);
    try {
      const res = await api.request('/activation/list') as { keys: CardKey[]; total: number };
      setKeys(res.keys || []);
    } catch (err: any) {
      toast('error', '加载卡密列表失败');
    } finally { setLoading(false); }
  }

  async function handleGenerate() {
    if (generateForm.count < 1 || generateForm.count > 500) {
      toast('error', '数量范围 1-500'); return;
    }
    setGenerating(true);
    try {
      const res = await api.request('/activation/generate', {
        method: 'POST', body: JSON.stringify(generateForm),
      }) as { count: number; keys: CardKey[] };
      setGeneratedKeys(res.keys || []);
      toast('success', `已生成 ${res.count} 个卡密`);
      await loadKeys();
      setShowGenerate(false);
    } catch (err: any) {
      toast('error', '生成卡密失败');
    } finally { setGenerating(false); }
  }

  async function handleDisable(ids: string[]) {
    try {
      await api.request('/activation/disable', { method: 'POST', body: JSON.stringify({ ids }) });
      toast('success', `已禁用 ${ids.length} 个卡密`);
      setSelectedIds(new Set());
      await loadKeys();
    } catch { toast('error', '禁用失败'); }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  }

  function toggleAll() {
    if (selectedIds.size === filteredKeys.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredKeys.map(k => k.id)));
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast('success', '已复制到剪贴板');
  }

  function exportCSV() {
    const header = '卡密,天数,最大设备,已用设备,状态,创建时间,备注';
    const rows = filteredKeys.map(k => [k.code, k.days, k.maxDevices, k.usedDevices, k.status, new Date(k.createdAt).toLocaleDateString('zh-CN'), k.note || ''].join(','));
    const csv = '﻿' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `卡密列表_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const filteredKeys = keys.filter(k => {
    if (filterStatus !== 'all' && k.status !== filterStatus) return false;
    if (search && !k.code.toLowerCase().includes(search.toLowerCase()) && !(k.note || '').includes(search)) return false;
    return true;
  });

  const STATUS_TAGS: Record<string, { label: string; className: string }> = {
    active: { label: '可用', className: 'bg-green-100 text-green-700' },
    used: { label: '已使用', className: 'bg-blue-100 text-blue-700' },
    expired: { label: '已过期', className: 'bg-yellow-100 text-yellow-700' },
    disabled: { label: '已禁用', className: 'bg-red-100 text-red-700' },
  };

  return (
    <PageWrapper title="卡密管理">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索卡密..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="all">全部状态</option>
          <option value="active">可用</option>
          <option value="used">已使用</option>
          <option value="expired">已过期</option>
          <option value="disabled">已禁用</option>
        </select>
        <button onClick={() => setShowGenerate(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={16} /> 生成卡密
        </button>
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
          <Download size={16} /> 导出 CSV
        </button>
        {selectedIds.size > 0 && (
          <button onClick={() => handleDisable(Array.from(selectedIds))} className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">
            <Ban size={16} /> 禁用 {selectedIds.size} 个
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-4 py-3"><input type="checkbox" checked={selectedIds.size === filteredKeys.length && filteredKeys.length > 0} onChange={toggleAll} /></th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">卡密</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">有效期</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">设备配额</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">备注</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">创建时间</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">加载中...</td></tr>
              ) : filteredKeys.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">暂无数据</td></tr>
              ) : filteredKeys.map(k => (
                <tr key={k.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(k.id)} onChange={() => toggleSelect(k.id)} /></td>
                  <td className="px-4 py-3 font-mono text-xs">{k.code}</td>
                  <td className="px-4 py-3 text-gray-500">{k.days} 天</td>
                  <td className="px-4 py-3 text-center">{k.usedDevices}/{k.maxDevices}</td>
                  <td className="px-4 py-3 text-center"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_TAGS[k.status]?.className || ''}`}>{STATUS_TAGS[k.status]?.label || k.status}</span></td>
                  <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{k.note || '-'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(k.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => copyToClipboard(k.code)} className="p-1 hover:bg-gray-100 rounded" title="复制"><Copy size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowGenerate(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">生成卡密</h3>
              <button onClick={() => setShowGenerate(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-sm text-gray-600 mb-1">生成数量</label><input type="number" value={generateForm.count} onChange={e => setGenerateForm(f => ({ ...f, count: +e.target.value }))} min={1} max={500} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">有效期 (天)</label><input type="number" value={generateForm.days} onChange={e => setGenerateForm(f => ({ ...f, days: +e.target.value }))} min={1} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">最大设备数</label><input type="number" value={generateForm.maxDevices} onChange={e => setGenerateForm(f => ({ ...f, maxDevices: +e.target.value }))} min={1} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">前缀 (可选)</label><input type="text" value={generateForm.prefix} onChange={e => setGenerateForm(f => ({ ...f, prefix: e.target.value }))} placeholder="如: VIP" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">备注 (可选)</label><input type="text" value={generateForm.note} onChange={e => setGenerateForm(f => ({ ...f, note: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowGenerate(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
              <button onClick={handleGenerate} disabled={generating} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {generating ? '生成中...' : '确认生成'}
              </button>
            </div>
            {generatedKeys.length > 0 && (
              <div className="mt-4 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-2">生成的卡密（请及时保存）:</div>
                {generatedKeys.map(k => (
                  <div key={k.id} className="flex items-center justify-between text-xs font-mono py-1">
                    <span>{k.code}</span>
                    <button onClick={() => copyToClipboard(k.code)} className="text-blue-600 hover:text-blue-800"><Copy size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

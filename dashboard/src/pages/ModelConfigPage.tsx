import { useEffect, useState, useMemo } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';
import PageWrapper from '../components/PageWrapper';
import { SkeletonGrid } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusBadge from '../components/StatusBadge';
import SearchBar from '../components/SearchBar';
import FilterBar from '../components/FilterBar';
import {
  Cpu, Plus, Trash2, Edit3, Star, Zap, Loader2, X, Eye, EyeOff,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, FlaskConical
} from 'lucide-react';

type ModelType = 'autoglm' | 'qwenvl' | 'uitars' | 'maiui' | 'guiowl' | 'deepseek' | 'guiplus';

const MODEL_TYPE_NAMES: Record<ModelType, string> = {
  autoglm: 'AutoGLM',
  qwenvl: 'Qwen-VL',
  uitars: 'UI-TARS',
  maiui: 'MAI-UI',
  guiowl: 'GUI-Owl',
  deepseek: 'DeepSeek',
  guiplus: 'GUI-Plus',
};

const MODEL_TYPE_COLORS: Record<ModelType, string> = {
  autoglm: 'bg-blue-100 text-blue-700',
  qwenvl: 'bg-purple-100 text-purple-700',
  uitars: 'bg-emerald-100 text-emerald-700',
  maiui: 'bg-amber-100 text-amber-700',
  guiowl: 'bg-pink-100 text-pink-700',
  deepseek: 'bg-indigo-100 text-indigo-700',
  guiplus: 'bg-orange-100 text-orange-700',
};

interface FormData {
  name: string;
  modelName: string;
  modelType: ModelType;
  apiUrl: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  perImage: string;
  isDefault: boolean;
  isEnabled: boolean;
  description: string;
}

const EMPTY_FORM: FormData = {
  name: '',
  modelName: '',
  modelType: 'autoglm',
  apiUrl: 'http://localhost:5000/api/vlm/execute',
  apiKey: '',
  maxTokens: 1024,
  temperature: 0.1,
  inputPer1kTokens: 0.001,
  outputPer1kTokens: 0.003,
  perImage: '',
  isDefault: false,
  isEnabled: true,
  description: '',
};

export default function ModelConfigPage() {
  const models = useStore(s => s.models);
  const modelsLoading = useStore(s => s.modelsLoading);
  const modelsError = useStore(s => s.modelsError);
  const loadModels = useStore(s => s.loadModels);
  const createModel = useStore(s => s.createModel);
  const updateModel = useStore(s => s.updateModel);
  const deleteModel = useStore(s => s.deleteModel);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test connection
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  // A/B Test
  const [abExpanded, setAbExpanded] = useState(false);
  const [abModelA, setAbModelA] = useState('');
  const [abModelB, setAbModelB] = useState('');
  const [abEpisodeId, setAbEpisodeId] = useState('');
  const [abEpisodes, setAbEpisodes] = useState<any[]>([]);
  const [abRunning, setAbRunning] = useState(false);
  const [abResult, setAbResult] = useState<any>(null);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Load episodes for A/B test
  useEffect(() => {
    api.vlmGetEpisodes().then(setAbEpisodes).catch(() => {});
  }, []);

  // Filters
  const filteredModels = useMemo(() => {
    let list = models;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.modelName.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter) {
      list = list.filter(m => m.modelType === typeFilter);
    }
    return list;
  }, [models, search, typeFilter]);

  const typeFilterOptions = (['autoglm', 'qwenvl', 'uitars', 'maiui', 'guiowl', 'deepseek', 'guiplus'] as ModelType[]).map(t => ({
    key: t,
    label: MODEL_TYPE_NAMES[t],
  }));

  // Form handlers
  const openAddForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowApiKey(false);
    setShowForm(true);
  };

  const openEditForm = (id: string) => {
    const m = models.find(m => m.id === id);
    if (!m) return;
    setEditingId(id);
    setForm({
      name: m.name,
      modelName: m.modelName,
      modelType: m.modelType,
      apiUrl: m.apiUrl,
      apiKey: m.apiKey || '',
      maxTokens: m.maxTokens,
      temperature: m.temperature,
      inputPer1kTokens: m.pricing.inputPer1kTokens,
      outputPer1kTokens: m.pricing.outputPer1kTokens,
      perImage: m.pricing.perImage != null ? String(m.pricing.perImage) : '',
      isDefault: m.isDefault,
      isEnabled: m.isEnabled,
      description: m.description || '',
    });
    setShowApiKey(false);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.modelName || !form.apiUrl) {
      toast('error', '请填写名称、模型标识和 API 地址');
      return;
    }
    setSubmitting(true);
    try {
      const data: Record<string, unknown> = {
        name: form.name,
        modelName: form.modelName,
        modelType: form.modelType,
        apiUrl: form.apiUrl,
        maxTokens: form.maxTokens,
        temperature: form.temperature,
        pricing: {
          inputPer1kTokens: form.inputPer1kTokens,
          outputPer1kTokens: form.outputPer1kTokens,
          perImage: form.perImage ? Number(form.perImage) : undefined,
        },
        isDefault: form.isDefault,
        isEnabled: form.isEnabled,
        description: form.description || undefined,
      };
      if (form.apiKey) (data as any).apiKey = form.apiKey;

      if (editingId) {
        await updateModel(editingId, data);
      } else {
        await createModel(data);
      }
      setShowForm(false);
    } catch {
      // store handles toast
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await updateModel(id, { isDefault: true });
    } catch {
      // store handles toast
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteModel(id);
      setDeleteId(null);
    } catch {
      // store handles toast
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await api.vlmTestModel(id);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || '测试失败' });
    } finally {
      setTestingId(null);
    }
  };

  const handleRunABTest = async () => {
    if (!abModelA || !abModelB || !abEpisodeId) {
      toast('error', '请选择两个模型和一个 Episode');
      return;
    }
    if (abModelA === abModelB) {
      toast('error', '请选择两个不同的模型');
      return;
    }
    setAbRunning(true);
    setAbResult(null);
    try {
      const result = await api.vlmRunABTest({
        modelAId: abModelA,
        modelBId: abModelB,
        episodeId: abEpisodeId,
      });
      setAbResult(result);
      toast('success', 'A/B 对比完成');
    } catch (err: any) {
      toast('error', err.message || 'A/B 测试失败');
    } finally {
      setAbRunning(false);
    }
  };

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Cpu size={24} className="text-purple-600" />
            VLM 模型配置
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            共 {models.length} 个模型，启用 {models.filter(m => m.isEnabled).length} 个
          </p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          添加模型
        </button>
      </div>

      {/* Filters */}
      {(models.length > 0 || search || typeFilter) && (
        <div className="flex items-center gap-3 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="搜索模型名称..." />
          <FilterBar options={typeFilterOptions} value={typeFilter} onChange={setTypeFilter} label="类型" />
          {(search || typeFilter) && (
            <span className="text-xs text-gray-400">
              显示 {filteredModels.length}/{models.length} 个
            </span>
          )}
        </div>
      )}

      {/* Model Cards */}
      {modelsLoading && models.length === 0 && <SkeletonGrid count={6} />}

      {!modelsLoading && filteredModels.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModels.map(m => {
            const isTesting = testingId === m.id;
            const showTestResult = testResult && testingId === null;

            return (
              <div
                key={m.id}
                className={`bg-white rounded-xl border p-5 hover:shadow-sm transition-all group ${
                  m.isDefault
                    ? 'border-purple-300 bg-purple-50/30'
                    : 'border-gray-200 hover:border-purple-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-gray-900 truncate">{m.name}</h3>
                      {m.isDefault && (
                        <Star size={14} className="text-purple-500 fill-purple-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{m.modelName}</p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${MODEL_TYPE_COLORS[m.modelType] || 'bg-gray-100 text-gray-600'}`}>
                    {MODEL_TYPE_NAMES[m.modelType] || m.modelType}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-1.5 mb-3">
                  <div className="text-xs text-gray-500 font-mono truncate" title={m.apiUrl}>
                    {m.apiUrl}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">
                      定价: <span className="text-gray-700">${m.pricing.inputPer1kTokens}/1K in</span>
                      <span className="text-gray-400"> · </span>
                      <span className="text-gray-700">${m.pricing.outputPer1kTokens}/1K out</span>
                      {m.pricing.perImage != null && (
                        <>
                          <span className="text-gray-400"> · </span>
                          <span className="text-gray-700">${m.pricing.perImage}/img</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span>Tokens: {m.maxTokens}</span>
                    <span>·</span>
                    <span>Temp: {m.temperature}</span>
                  </div>
                  {m.description && (
                    <p className="text-xs text-gray-400 truncate" title={m.description}>
                      {m.description}
                    </p>
                  )}
                </div>

                {/* Status + Created */}
                <div className="flex items-center gap-2 mb-3">
                  <StatusBadge variant={m.isEnabled ? 'online' : 'offline'} label={m.isEnabled ? '已启用' : '已禁用'} />
                  <span className="text-xs text-gray-400">
                    {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>

                {/* Test result */}
                {showTestResult && testResult && (
                  <div className={`text-xs rounded-lg px-3 py-1.5 mb-3 ${
                    testResult.success
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-600 border border-red-200'
                  }`}>
                    {testResult.success ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        {testResult.message || `连接成功 (${testResult.latencyMs}ms)`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <XCircle size={12} />
                        {testResult.error || '连接失败'}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openEditForm(m.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Edit3 size={13} />
                    编辑
                  </button>
                  <button
                    onClick={() => handleTest(m.id)}
                    disabled={isTesting}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                    测试
                  </button>
                  {!m.isDefault && (
                    <button
                      onClick={() => handleSetDefault(m.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      title="设为默认"
                    >
                      <Star size={13} />
                      默认
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteId(m.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-auto"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* A/B Test Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setAbExpanded(!abExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FlaskConical size={18} className="text-purple-600" />
            <span className="font-medium text-gray-900 text-sm">模型对比测试 (A/B Test)</span>
          </div>
          {abExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {abExpanded && (
          <div className="p-4 pt-0 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-4">选择两个模型和同一个 Episode，对比执行效果和成本</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">模型 A</label>
                <select
                  value={abModelA}
                  onChange={e => setAbModelA(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- 选择模型 --</option>
                  {models.filter(m => m.isEnabled).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">模型 B</label>
                <select
                  value={abModelB}
                  onChange={e => setAbModelB(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- 选择模型 --</option>
                  {models.filter(m => m.isEnabled).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Episode</label>
                <select
                  value={abEpisodeId}
                  onChange={e => setAbEpisodeId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- 选择 Episode --</option>
                  {abEpisodes.map((ep: any) => (
                    <option key={ep.episodeId} value={ep.episodeId}>
                      {ep.taskPrompt?.slice(0, 40)}... ({ep.totalSteps}步)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleRunABTest}
              disabled={abRunning || !abModelA || !abModelB || !abEpisodeId}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {abRunning ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
              {abRunning ? '对比中...' : '运行对比'}
            </button>

            {/* A/B Result */}
            {abResult && (
              <div className="mt-4 space-y-3">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-900 text-sm mb-2">对比结果</h4>
                  {abResult.result?.recommendation && (
                    <p className="text-sm text-purple-800 mb-2">{abResult.result.recommendation}</p>
                  )}
                  {abResult.result?.comparisons?.map((c: any, i: number) => (
                    <div key={i} className="bg-white rounded-lg p-3 mb-2 last:mb-0 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-700">{c.modelA} vs {c.modelB}</span>
                        <span className={`font-medium ${c.winner === c.modelA ? 'text-green-600' : c.winner === c.modelB ? 'text-blue-600' : 'text-gray-500'}`}>
                          {c.winner === 'tie' ? '平局' : `胜出: ${c.winner}`}
                        </span>
                      </div>
                    </div>
                  ))}
                  {abResult.result?.report && (
                    <pre className="text-xs font-mono text-gray-600 mt-2 whitespace-pre-wrap bg-white rounded-lg p-3 max-h-60 overflow-auto">
                      {abResult.result.report}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageWrapper
        loading={false}
        error={modelsError}
        empty={!modelsLoading && !modelsError && models.length === 0}
        emptyTitle="暂无模型配置"
        emptyDescription="添加 VLM 大模型以开始使用 AI 自动化功能"
        emptyAction={
          <button
            onClick={openAddForm}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            添加第一个模型
          </button>
        }
        emptyResults={!modelsLoading && !modelsError && models.length > 0 && filteredModels.length === 0}
        onClearFilters={() => { setSearch(''); setTypeFilter(''); }}
      >
        {content}
      </PageWrapper>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10 pb-10 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Cpu size={18} className="text-purple-600" />
                <h3 className="font-semibold text-gray-900">
                  {editingId ? '编辑模型' : '添加模型'}
                </h3>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">显示名称 *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="AutoGLM-Phone-9B"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">模型标识 *</label>
                  <input
                    type="text"
                    value={form.modelName}
                    onChange={e => setForm(f => ({ ...f, modelName: e.target.value }))}
                    placeholder="autoglm-phone-9b"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">模型类型</label>
                  <select
                    value={form.modelType}
                    onChange={e => setForm(f => ({ ...f, modelType: e.target.value as ModelType }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
                  >
                    {(Object.entries(MODEL_TYPE_NAMES) as [ModelType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">API 地址 *</label>
                  <input
                    type="text"
                    value={form.apiUrl}
                    onChange={e => setForm(f => ({ ...f, apiUrl: e.target.value }))}
                    placeholder="http://localhost:5000/api/vlm/execute"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    placeholder="可选"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm pr-9 focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Max Tokens</label>
                  <input
                    type="number"
                    value={form.maxTokens}
                    onChange={e => setForm(f => ({ ...f, maxTokens: Number(e.target.value) }))}
                    min={1} max={32768}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Temperature</label>
                  <input
                    type="number"
                    value={form.temperature}
                    onChange={e => setForm(f => ({ ...f, temperature: Number(e.target.value) }))}
                    min={0} max={2} step={0.01}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Pricing */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">定价 ($/USD)</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Input /1K</label>
                    <input
                      type="number"
                      value={form.inputPer1kTokens}
                      onChange={e => setForm(f => ({ ...f, inputPer1kTokens: Number(e.target.value) }))}
                      min={0} step={0.0001}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Output /1K</label>
                    <input
                      type="number"
                      value={form.outputPer1kTokens}
                      onChange={e => setForm(f => ({ ...f, outputPer1kTokens: Number(e.target.value) }))}
                      min={0} step={0.0001}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Per Image</label>
                    <input
                      type="number"
                      value={form.perImage}
                      onChange={e => setForm(f => ({ ...f, perImage: e.target.value }))}
                      placeholder="可选"
                      min={0} step={0.0001}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="模型简介..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">设为默认模型</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isEnabled}
                    onChange={e => setForm(f => ({ ...f, isEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">启用</span>
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? '保存修改' : '添加模型'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        title="确认删除"
        message="确定要删除此模型配置吗？此操作不可撤销。"
        confirmLabel="删除"
        variant="danger"
        loading={deleting}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}

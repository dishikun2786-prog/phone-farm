import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { ArrowLeft } from 'lucide-react';

const PLATFORM_OPTIONS = [
  { value: 'dy', label: '抖音' },
  { value: 'ks', label: '快手' },
  { value: 'wx', label: '微信视频号' },
  { value: 'xhs', label: '小红书' },
];

export default function TaskCreate() {
  const navigate = useNavigate();
  const templates = useStore(s => s.templates);
  const devices = useStore(s => s.devices);
  const loadTemplates = useStore(s => s.loadTemplates);
  const loadDevices = useStore(s => s.loadDevices);
  const createTask = useStore(s => s.createTask);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [configJson, setConfigJson] = useState('{}');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTemplates();
    loadDevices();
  }, []);

  const selectedTemplate = templates.find(t => t.id === templateId);
  const filteredTemplates = templateId
    ? templates
    : templates;

  const handleTemplateSelect = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find(t => t.id === id);
    if (tpl && tpl.defaultConfig) {
      setConfigJson(JSON.stringify(tpl.defaultConfig, null, 2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let config = {};
    try {
      config = JSON.parse(configJson);
    } catch {
      setError('配置JSON格式无效');
      return;
    }

    setSubmitting(true);
    try {
      await createTask({
        name,
        templateId: templateId || undefined,
        deviceId,
        accountId: null,
        config,
        cronExpr: cronExpr || undefined,
        enabled: true,
      });
      navigate('/tasks');
    } catch (err: any) {
      setError(err.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const onlineDevices = devices.filter(d => d.status === 'online');

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/tasks')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> 返回
      </button>

      <h2 className="text-xl font-bold text-gray-900 mb-6">创建任务</h2>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">任务名称</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如: 抖音科技类营销"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">任务类型</label>
          <select
            value={templateId}
            onChange={e => handleTemplateSelect(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- 选择任务模板 --</option>
            {PLATFORM_OPTIONS.map(plat => (
              <optgroup key={plat.value} label={plat.label}>
                {filteredTemplates.filter(t => t.platform === plat.value).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedTemplate && (
            <p className="text-xs text-gray-500 mt-1">{selectedTemplate.description}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">目标设备</label>
          <select
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">-- 选择设备 --</option>
            {onlineDevices.map(d => (
              <option key={d.id} value={d.id}>{d.name} ({d.tailscaleIp})</option>
            ))}
            {devices.filter(d => d.status !== 'online').map(d => (
              <option key={d.id} value={d.id} disabled>{d.name} [离线]</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cron 表达式 (可选)</label>
          <input
            type="text"
            value={cronExpr}
            onChange={e => setCronExpr(e.target.value)}
            placeholder="0 9,14,20 * * * (早9点/下午2点/晚8点执行)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">任务配置 (JSON)</label>
          <textarea
            value={configJson}
            onChange={e => setConfigJson(e.target.value)}
            rows={12}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {submitting ? '创建中...' : '创建任务'}
        </button>
      </form>
    </div>
  );
}

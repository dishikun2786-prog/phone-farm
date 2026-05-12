/**
 * ConfigManagement — centralized configuration overview page.
 *
 * Shows:
 *  - 15 category cards with config counts
 *  - Quick actions: seed defaults, export, import
 *  - Config stats summary
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { getCategoryIcon } from '../../components/ConfigField';
import {
  Download, Upload, RefreshCw, ArrowRight, Database, Globe, Smartphone, Package, ShieldCheck,
} from 'lucide-react';

interface Category {
  id: string;
  key: string;
  displayName: string;
  description?: string;
  icon: string;
  sortOrder: number;
}

interface ConfigDef {
  id: string;
  categoryId: string;
  key: string;
  valueType: string;
}

export default function ConfigManagement() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [definitions, setDefinitions] = useState<ConfigDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [catRes, defRes] = await Promise.all([
        api.configGetCategories(),
        api.configGetDefinitions(),
      ]);
      setCategories(catRes.categories || []);
      setDefinitions(defRes.definitions || []);
    } catch {
      toast('error', '加载配置数据失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await api.configSeed() as any;
      toast('success', `已初始化 ${res.definitions} 个配置定义`);
      await loadData();
    } catch {
      toast('error', '初始化失败');
    } finally {
      setSeeding(false);
    }
  }

  async function handleExport() {
    try {
      const data = await api.configExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phonefarm-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('success', '配置已导出');
    } catch {
      toast('error', '导出失败');
    }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const res = await api.configImport({ values: data.values, templates: data.templates, overwrite: false }) as any;
        toast('success', `已导入 ${res.importedValues} 个值, ${res.importedTemplates} 个模板`);
        await loadData();
      } catch {
        toast('error', '导入失败，请检查文件格式');
      }
    };
    input.click();
  }

  function countDefs(categoryId: string) {
    return definitions.filter((d) => d.categoryId === categoryId).length;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">配置管理中心</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {definitions.length} 个配置项 · {categories.length} 个类别 · 6 级作用域
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Database size={14} />
            {seeding ? '初始化中...' : '初始化默认值'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            <Download size={14} /> 导出
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            <Upload size={14} /> 导入
          </button>
        </div>
      </div>

      {/* Quick nav cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <QuickCard
          icon={Globe}
          title="全局配置"
          desc="管理所有设备共享的全局默认值"
          color="blue"
          onClick={() => navigate('/config/global')}
        />
        <QuickCard
          icon={Smartphone}
          title="设备配置"
          desc="按设备独立覆盖配置参数"
          color="green"
          onClick={() => navigate('/config/device')}
        />
        <QuickCard
          icon={Package}
          title="配置模板"
          desc="创建可复用的配置预设方案"
          color="indigo"
          onClick={() => navigate('/config/templates')}
        />
        <QuickCard
          icon={ShieldCheck}
          title="变更审计"
          desc="追踪所有配置修改历史记录"
          color="gray"
          onClick={() => navigate('/config/audit')}
        />
      </div>

      {/* Category list */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="font-semibold text-gray-900 dark:text-slate-100">配置类别</h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {categories
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((cat) => {
              const Icon = getCategoryIcon(cat.icon);
              const count = countDefs(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => navigate(`/config/global?category=${cat.key}`)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                    <Icon size={20} className="text-gray-600 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{cat.displayName}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{cat.description}</p>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 rounded-full px-2 py-0.5">
                    {count} 项
                  </span>
                  <ArrowRight size={16} className="text-gray-300 dark:text-slate-600" />
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function QuickCard({ icon: Icon, title, desc, color, onClick }: {
  icon: typeof Globe;
  title: string;
  desc: string;
  color: 'blue' | 'green' | 'indigo' | 'gray';
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100',
    gray: 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-100 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700',
  };

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 p-4 rounded-xl border transition-colors text-left ${colors[color]}`}
    >
      <Icon size={22} />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-70 mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

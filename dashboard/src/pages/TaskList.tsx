import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import {
  Play, Square, Trash2, Plus, RefreshCw,
  Search, X, Loader2, Clock
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import { SkeletonRow } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import { toast } from '../hooks/useToast';

function timeAgo(ts: number): string {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return '刚刚更新';
  if (sec < 60) return `${sec} 秒前更新`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前更新`;
  return `${Math.floor(sec / 3600)} 小时前更新`;
}

const PLATFORM_NAMES: Record<string, string> = {
  dy: '抖音',
  ks: '快手',
  wx: '微信', wx_video: '微信视频号',
  xhs: '小红书',
};

export default function TaskList() {
  const navigate = useNavigate();
  const tasks = useStore(s => s.tasks);
  const tasksLoading = useStore(s => s.tasksLoading);
  const tasksError = useStore(s => s.tasksError);
  const tasksUpdatedAt = useStore(s => s.tasksUpdatedAt);
  const templates = useStore(s => s.templates);
  const templatesLoading = useStore(s => s.templatesLoading);
  const devices = useStore(s => s.devices);
  const loadTasks = useStore(s => s.loadTasks);
  const loadTemplates = useStore(s => s.loadTemplates);
  const loadDevices = useStore(s => s.loadDevices);
  const runTask = useStore(s => s.runTask);
  const stopTask = useStore(s => s.stopTask);
  const deleteTask = useStore(s => s.deleteTask);
  const seedTemplates = useStore(s => s.seedTemplates);

  const [seeded, setSeeded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
    loadTemplates();
    loadDevices();
  }, []);

  const handleSeed = async () => {
    await seedTemplates();
    setSeeded(true);
  };

  const getTemplateName = (templateId: string) => {
    return templates.find(t => t.id === templateId)?.name || '-';
  };

  const getDeviceName = (deviceId: string) => {
    return devices.find(d => d.id === deviceId)?.name || '-';
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await runTask(id);
    } finally {
      setRunningId(null);
    }
  };

  const handleStop = async (id: string) => {
    setStoppingId(id);
    try {
      await stopTask(id);
    } finally {
      setStoppingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteTask(id);
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        getTemplateName(t.templateId).toLowerCase().includes(q) ||
        getDeviceName(t.deviceId).toLowerCase().includes(q)
      );
    }
    if (platformFilter) {
      list = list.filter(t => (t.config as any)?.platform === platformFilter);
    }
    return list;
  }, [tasks, searchQuery, platformFilter, templates, devices]);

  const platformList = [...new Set(tasks.map(t => (t.config as any)?.platform).filter(Boolean))] as string[];
  const isLoading = (tasksLoading || templatesLoading) && tasks.length === 0;
  const hasFilter = searchQuery || platformFilter;

  const content = (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">任务管理</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            共 {tasks.length} 个任务
            {hasFilter && (
              <span className="text-blue-600 ml-1">— 显示 {filteredTasks.length} 个</span>
            )}
            {tasksUpdatedAt > 0 && (
              <span className="inline-flex items-center gap-1 text-gray-400 ml-2">
                <Clock size={10} />
                {timeAgo(tasksUpdatedAt)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {templates.length === 0 && (
            <button
              onClick={handleSeed}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
            >
              <RefreshCw size={14} /> {seeded ? '已初始化' : '初始化任务模板'}
            </button>
          )}
          <button
            onClick={() => navigate('/tasks/new')}
            className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> 创建任务
          </button>
        </div>
      </div>

      {/* Filters */}
      {(tasks.length > 0 || hasFilter) && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索任务名称/模板/设备..."
              className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-52"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {platformList.length > 0 && (
            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">全部平台</option>
              {platformList.map(p => (
                <option key={p} value={p}>{PLATFORM_NAMES[p] || p}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {/* Data */}
      {filteredTasks.length > 0 && (
        <div className="space-y-2">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-gray-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900 truncate">{task.name}</h3>
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                    {PLATFORM_NAMES[(task.config as any)?.platform as string] || '-'}
                  </span>
                  <span className="text-xs text-gray-400 truncate">
                    {getTemplateName(task.templateId)}
                  </span>
                  {task.cronExpr && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono shrink-0">
                      {task.cronExpr}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span>设备: {getDeviceName(task.deviceId)}</span>
                  <span className={task.enabled ? 'text-green-600' : 'text-gray-400'}>
                    {task.enabled ? '已启用' : '已禁用'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleRun(task.id)}
                  disabled={runningId === task.id}
                  className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition-colors disabled:opacity-50"
                  title="执行"
                >
                  {runningId === task.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                </button>
                <button
                  onClick={() => handleStop(task.id)}
                  disabled={stoppingId === task.id}
                  className="p-1.5 hover:bg-orange-50 text-orange-600 rounded-lg transition-colors disabled:opacity-50"
                  title="停止"
                >
                  {stoppingId === task.id ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
                </button>
                <button
                  onClick={() => setDeleteId(task.id)}
                  className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageWrapper
        loading={false}
        error={tasksError || ''}
        empty={!isLoading && !tasksError && tasks.length === 0}
        emptyTitle="暂无任务"
        emptyDescription="创建自动化任务以开始群控营销"
        emptyAction={
          <button
            onClick={() => navigate('/tasks/new')}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            创建任务
          </button>
        }
        emptyResults={!isLoading && !tasksError && tasks.length > 0 && filteredTasks.length === 0}
        onClearFilters={() => { setSearchQuery(''); setPlatformFilter(''); }}
      >
        {content}
      </PageWrapper>

      <ConfirmDialog
        open={deleteId !== null}
        title="确认删除"
        message="确定要删除此任务吗？此操作不可撤销。"
        confirmLabel="删除"
        variant="danger"
        loading={deleting}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Play, Square, Trash2, Plus, RefreshCw } from 'lucide-react';

const PLATFORM_NAMES: Record<string, string> = {
  dy: '抖音',
  ks: '快手',
  wx: '微信',  wx_video: '微信视频号',
  xhs: '小红书',
};

export default function TaskList() {
  const navigate = useNavigate();
  const tasks = useStore(s => s.tasks);
  const templates = useStore(s => s.templates);
  const devices = useStore(s => s.devices);
  const loadTasks = useStore(s => s.loadTasks);
  const loadTemplates = useStore(s => s.loadTemplates);
  const loadDevices = useStore(s => s.loadDevices);
  const runTask = useStore(s => s.runTask);
  const stopTask = useStore(s => s.stopTask);
  const deleteTask = useStore(s => s.deleteTask);
  const seedTemplates = useStore(s => s.seedTemplates);
  const [seeded, setSeeded] = useState(false);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">任务管理</h2>
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

      {tasks.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">暂无任务</p>
          <p className="text-sm mt-1">点击"创建任务"开始</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <div
              key={task.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-gray-300 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{task.name}</h3>
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    {PLATFORM_NAMES[task.config?.platform as string] || '-'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {getTemplateName(task.templateId)}
                  </span>
                  {task.cronExpr && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">
                      {task.cronExpr}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span>设备: {getDeviceName(task.deviceId)}</span>
                  <span>{task.enabled ? '启用' : '禁用'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => runTask(task.id)}
                  className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                  title="执行"
                >
                  <Play size={16} />
                </button>
                <button
                  onClick={() => stopTask(task.id)}
                  className="p-1.5 hover:bg-orange-50 text-orange-600 rounded-lg transition-colors"
                  title="停止"
                >
                  <Square size={16} />
                </button>
                <button
                  onClick={() => deleteTask(task.id)}
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
}

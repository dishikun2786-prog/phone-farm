import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface PortalTask {
  id: string;
  name: string;
  status: string;
  deviceId: string;
  accountId: string;
  cronExpr: string;
  enabled: boolean;
  createdAt: string;
}

export default function TaskManagementPage() {
  const [tasks, setTasks] = useState<PortalTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.portalGetTasks()
      .then((data) => setTasks(data.tasks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">我的任务</h1>
      {tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">暂无任务</p>
          <p className="text-sm mt-2">您还没有创建任何自动化任务</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium">{t.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    {t.deviceId && <span>设备: {t.deviceId}</span>}
                    {t.cronExpr && <span>Cron: {t.cronExpr}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    t.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.enabled ? '已启用' : '已禁用'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    t.status === 'running' ? 'bg-blue-50 text-blue-700'
                    : t.status === 'completed' ? 'bg-green-50 text-green-700'
                    : t.status === 'failed' ? 'bg-red-50 text-red-700'
                    : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.status || 'idle'}
                  </span>
                </div>
              </div>
              {t.createdAt && (
                <p className="text-xs text-gray-400 mt-2">创建于 {new Date(t.createdAt).toLocaleDateString()}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

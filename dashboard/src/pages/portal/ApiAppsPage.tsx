import { useEffect, useState } from 'react';
import { portalApi } from '../../lib/api-portal';

interface ApiApp {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  enabled: boolean;
  rateLimitQps: number;
  lastUsedAt: string;
  createdAt: string;
}

export default function ApiAppsPage() {
  const [apps, setApps] = useState<ApiApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.getApiKeys()
      .then((data) => setApps(data.keys || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">API 应用管理</h1>
      <p className="text-sm text-gray-500 mb-6">管理您的 API 应用和访问密钥</p>

      {apps.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
          <p className="text-lg">暂无 API 应用</p>
          <p className="text-sm mt-2">前往 <a href="/portal/api-keys" className="text-blue-500 hover:underline">API Keys</a> 创建您的第一个应用</p>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => (
            <div key={app.id} className="bg-white border rounded-lg p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{app.name}</h3>
                  <code className="text-xs bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
                    {app.keyPrefix}****
                  </code>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${app.enabled ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {app.enabled ? '活跃' : '禁用'}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-gray-400">权限</p>
                  <div className="flex gap-1 mt-1">
                    {app.permissions.map((p) => (
                      <span key={p} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{p}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400">QPS 限制</p>
                  <p className="text-sm font-mono mt-1">{app.rateLimitQps}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">最近使用</p>
                  <p className="text-sm mt-1">{app.lastUsedAt ? new Date(app.lastUsedAt).toLocaleDateString() : '从未使用'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">创建时间</p>
                  <p className="text-sm mt-1">{new Date(app.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Usage examples */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-500 mb-2">使用示例</p>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-xs overflow-x-auto">
{`curl -X GET https://phone.openedskill.com/api/v2/open/devices \\
  -H "X-API-Key: ${app.keyPrefix}****"`}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

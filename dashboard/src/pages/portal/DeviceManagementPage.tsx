import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface PortalDevice {
  id: string;
  name: string;
  model: string;
  androidVersion: string;
  status: string;
  lastSeen: string;
}

export default function DeviceManagementPage() {
  const [devices, setDevices] = useState<PortalDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.portalGetDevices()
      .then((data) => setDevices(data.devices || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">我的设备</h1>
      {devices.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">暂无设备</p>
          <p className="text-sm mt-2">您的租户下没有注册设备</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">设备名称</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">型号</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Android</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">最后在线</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{d.name || d.id}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{d.model || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{d.androidVersion || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      d.status === 'online' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
                    }`}>
                      {d.status === 'online' ? '在线' : '离线'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

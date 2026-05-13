import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { Plus, Trash2, X } from 'lucide-react';

interface DeviceGroup {
  id: string;
  name: string;
  description: string;
  deviceIds: string[];
  tags: string[];
  createdAt: number;
}

export default function DeviceGroupManagement() {
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<DeviceGroup | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Partial<DeviceGroup> | null>(null);
  const devices = useStore(s => s.devices);
  const loadDevices = useStore(s => s.loadDevices);

  useEffect(() => { loadGroups(); loadDevices(); }, []);

  async function loadGroups() {
    setLoading(true);
    try {
      const groups = await api.getGroups();
      setGroups(Array.isArray(groups) ? groups : []);
    } catch { toast('error', '加载分组失败'); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!editingGroup?.name) { toast('error', '请输入分组名称'); return; }
    try {
      await api.createGroup({ name: editingGroup.name!, deviceIds: editingGroup.deviceIds || [] });
      toast('success', '分组已创建');
      setShowModal(false); setEditingGroup(null); await loadGroups();
    } catch { toast('error', '创建分组失败'); }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这个分组？')) return;
    try {
      await api.deleteGroup(id);
      toast('success', '分组已删除');
      if (selectedGroup?.id === id) setSelectedGroup(null);
      await loadGroups();
    } catch { toast('error', '删除分组失败'); }
  }

  async function handleAddDevice(deviceId: string) {
    if (!selectedGroup) return;
    try {
      await api.updateGroup(selectedGroup.id, { deviceIds: [...selectedGroup.deviceIds, deviceId] });
      toast('success', '设备已添加');
      await loadGroups();
      setSelectedGroup(groups.find(g => g.id === selectedGroup.id) || null);
    } catch { toast('error', '添加失败'); }
  }

  async function handleRemoveDevice(deviceId: string) {
    if (!selectedGroup) return;
    try {
      await api.updateGroup(selectedGroup.id, { deviceIds: selectedGroup.deviceIds.filter(id => id !== deviceId) });
      toast('success', '设备已移除');
      await loadGroups();
    } catch { toast('error', '移除失败'); }
  }

  function getDeviceName(id: string) { return devices.find(d => d.id === id)?.name || id; }
  function getDeviceStatus(id: string) { return devices.find(d => d.id === id)?.status || 'offline'; }

  return (
    <PageWrapper title="设备分组管理">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Group List */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-slate-100">分组列表 ({groups.length})</h3>
            <button onClick={() => { setEditingGroup({ name: '', deviceIds: [] }); setShowModal(true); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus size={14} /> 新建分组
            </button>
          </div>
          {loading ? <p className="text-gray-400 dark:text-slate-500 text-sm py-8 text-center">加载中...</p> :
           groups.length === 0 ? <p className="text-gray-400 dark:text-slate-500 text-sm py-8 text-center">暂无分组，点击"新建分组"创建</p> :
           <div className="space-y-2">{groups.map(g => (
            <button key={g.id} onClick={() => setSelectedGroup(g)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${selectedGroup?.id === g.id ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{g.name}</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{g.deviceIds.length} 台设备</div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(g.id); }} className="p-1 text-gray-400 dark:text-slate-500 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </button>
           ))}</div>
          }
        </div>

        {/* Group Detail */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          {!selectedGroup ? (
            <p className="text-gray-400 dark:text-slate-500 text-sm py-8 text-center">选择左侧分组查看详情</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100">{selectedGroup.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{selectedGroup.deviceIds.length} 台设备</p>
                </div>
              </div>
              <div className="space-y-2">
                {selectedGroup.deviceIds.length === 0 && <p className="text-gray-400 dark:text-slate-500 text-sm py-4 text-center">分组下暂无设备</p>}
                {selectedGroup.deviceIds.map(deviceId => (
                  <div key={deviceId} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-slate-700">
                    <div>
                      <div className="text-sm font-medium">{getDeviceName(deviceId)}</div>
                      <div className="text-xs text-gray-400 dark:text-slate-500">{deviceId}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${getDeviceStatus(deviceId) === 'online' ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <button onClick={() => handleRemoveDevice(deviceId)} className="p-1 text-gray-400 dark:text-slate-500 hover:text-red-500"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Available devices to add */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">可添加的设备:</div>
                <div className="flex flex-wrap gap-1.5">
                  {devices.filter(d => !selectedGroup.deviceIds.includes(d.id)).slice(0, 10).map(d => (
                    <button key={d.id} onClick={() => handleAddDevice(d.id)}
                      className="px-2 py-1 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded text-xs transition-colors">
                      + {d.name || d.id}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">新建分组</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">分组名称</label><input value={editingGroup?.name || ''} onChange={e => setEditingGroup(g => ({ ...g, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 dark:text-slate-400 mb-1">描述 (可选)</label><input value={(editingGroup as any)?.description || ''} onChange={e => setEditingGroup(g => ({ ...g, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg text-sm">取消</button>
              <button onClick={handleCreate} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">创建</button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

import { useEffect, useState } from 'react';
import { useGroupStore } from '../store/group-store';
import { useStore } from '../store';
import { Layers, Plus, X, Eye, EyeOff, Monitor, Check } from 'lucide-react';

interface Props {
  currentDeviceId?: string;
  onGroupChange?: (groupId: string | null) => void;
}

export default function GroupControlPanel({ onGroupChange }: Props) {
  const groups = useGroupStore(s => s.groups);
  const activeGroupId = useGroupStore(s => s.activeGroupId);
  const masterDeviceId = useGroupStore(s => s.masterDeviceId);
  const loadGroups = useGroupStore(s => s.loadGroups);
  const createGroup = useGroupStore(s => s.createGroup);
  const updateGroup = useGroupStore(s => s.updateGroup);
  const deleteGroup = useGroupStore(s => s.deleteGroup);
  const setActiveGroup = useGroupStore(s => s.setActiveGroup);
  const setMasterDevice = useGroupStore(s => s.setMasterDevice);
  const devices = useStore(s => s.devices);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const activeGroup = groups.find(g => g.id === activeGroupId);
  const onlineDevices = devices.filter(d => d.status === 'online');

  const handleCreate = async () => {
    if (!newName.trim() || selectedDevices.size === 0) return;
    const group = await createGroup(newName.trim(), [...selectedDevices]);
    if (group) {
      setActiveGroup(group.id);
      setShowCreate(false);
      setNewName('');
      setSelectedDevices(new Set());
    }
  };

  const handleSetMaster = (deviceId: string) => {
    if (!activeGroupId) return;
    setMasterDevice(deviceId);
    updateGroup(activeGroupId, { masterDeviceId: deviceId });
  };

  const handleToggleSync = () => {
    if (!activeGroup || !activeGroupId) return;
    const newMode: 'mirror' | 'independent' = activeGroup.syncMode === 'mirror' ? 'independent' : 'mirror';
    updateGroup(activeGroupId, { syncMode: newMode });
  };

  const handleToggleDevice = (deviceId: string) => {
    setSelectedDevices(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
          <Layers size={16} /> 群控
        </h3>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-2 py-1 bg-purple-600 dark:bg-purple-700 text-white rounded-md text-xs font-medium hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors active:scale-95"
        >
          <Plus size={12} /> 新建
        </button>
      </div>

      {/* Group list */}
      {groups.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-slate-500">暂无分组，点击「新建」创建设备分组</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {groups.map(group => (
            <div
              key={group.id}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                activeGroupId === group.id
                  ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800'
                  : 'bg-gray-50 dark:bg-slate-700 border border-transparent hover:bg-gray-100 dark:hover:bg-slate-600'
              }`}
              onClick={() => {
                setActiveGroup(activeGroupId === group.id ? null : group.id);
                onGroupChange?.(activeGroupId === group.id ? null : group.id);
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Layers size={12} className={activeGroupId === group.id ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-slate-500'} />
                <span className="font-medium truncate text-gray-900 dark:text-slate-100">{group.name}</span>
                <span className="text-gray-400 dark:text-slate-500">({group.deviceIds.length})</span>
                {group.syncMode === 'mirror' && (
                  <Eye size={10} className="text-green-500 shrink-0" />
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }}
                className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active group controls */}
      {activeGroup && (
        <div className="border-t border-gray-100 dark:border-slate-700 pt-3 space-y-2">
          {/* Sync mode toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-slate-400">同步模式</span>
            <button
              onClick={handleToggleSync}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors active:scale-95 ${
                activeGroup.syncMode === 'mirror'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
              }`}
            >
              {activeGroup.syncMode === 'mirror' ? (
                <><Eye size={10} /> 镜像同步</>
              ) : (
                <><EyeOff size={10} /> 独立操作</>
              )}
            </button>
          </div>

          {/* Master device selector */}
          <div>
            <span className="text-xs text-gray-500 dark:text-slate-400 block mb-1">主控设备</span>
            <div className="flex flex-wrap gap-1">
              {activeGroup.deviceIds.map(did => {
                const dev = devices.find(d => d.id === did);
                const isMaster = masterDeviceId === did;
                return (
                  <button
                    key={did}
                    onClick={() => handleSetMaster(did)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors active:scale-95 ${
                      isMaster
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                        : 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-600'
                    }`}
                  >
                    <Monitor size={10} />
                    {dev?.name || did.slice(0, 8)}
                    {isMaster && <Check size={10} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-5 w-80 animate-scale-in" onClick={e => e.stopPropagation()}>
            <h4 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">新建分组</h4>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="分组名称"
              className="w-full px-3 py-1.5 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-md text-sm text-gray-900 dark:text-slate-100 mb-3 focus:outline-none focus:border-purple-400 dark:focus:border-purple-500"
            />
            <div className="max-h-48 overflow-y-auto mb-3 space-y-1">
              {onlineDevices.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-slate-500">没有在线设备</p>
              ) : (
                onlineDevices.map(dev => (
                  <label key={dev.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 dark:hover:bg-slate-700 rounded cursor-pointer text-sm text-gray-900 dark:text-slate-100">
                    <input
                      type="checkbox"
                      checked={selectedDevices.has(dev.id)}
                      onChange={() => handleToggleDevice(dev.id)}
                      className="rounded"
                    />
                    <span>{dev.name}</span>
                    <span className="text-gray-400 dark:text-slate-500 text-xs ml-auto">{dev.status === 'online' ? '在线' : ''}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || selectedDevices.size === 0}
                className="px-3 py-1.5 text-xs bg-purple-600 dark:bg-purple-700 text-white rounded-md hover:bg-purple-700 dark:hover:bg-purple-600 disabled:opacity-40 transition-colors active:scale-95"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

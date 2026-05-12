import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import StatsDashboard from '../components/StatsDashboard';
import Pagination from '../components/Pagination';
import ConfirmDialog from '../components/ConfirmDialog';
import { toast } from '../hooks/useToast';
import SearchBar from '../components/SearchBar';
import FilterBar from '../components/FilterBar';
import {
  CheckCircle2, XCircle, Clock, Loader2, Trash2, FileCode2,
  Play, Bot
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  running: 'bg-blue-100 text-blue-700',
  pending: 'bg-gray-100 text-gray-600',
  stopped: 'bg-orange-100 text-orange-700',
};

const STATUS_LABELS: Record<string, string> = {
  completed: '已完成',
  failed: '失败',
  running: '运行中',
  pending: '等待中',
  stopped: '已停止',
};

const PAGE_SIZE = 20;

export default function EpisodeListPage() {
  const navigate = useNavigate();
  const episodes = useStore(s => s.episodes);
  const episodesLoading = useStore(s => s.episodesLoading);
  const loadEpisodes = useStore(s => s.loadEpisodes);
  const devices = useStore(s => s.devices);
  const loadDevices = useStore(s => s.loadDevices);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [compilingId, setCompilingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showCompileModal, setShowCompileModal] = useState<string | null>(null);
  const [compileName, setCompileName] = useState('');
  const [compilePlatform, setCompilePlatform] = useState('dy');
  const [showStats, setShowStats] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadEpisodes();
    loadDevices();
  }, [loadEpisodes, loadDevices]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterDevice, filterStatus, filterModel]);

  const handleFilter = useCallback(() => {
    setCurrentPage(1);
    loadEpisodes({
      deviceId: filterDevice || undefined,
      status: filterStatus || undefined,
      modelName: filterModel || undefined,
    });
  }, [filterDevice, filterStatus, filterModel, loadEpisodes]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await api.vlmDeleteEpisode(id);
      toast('success', 'Episode 已删除');
      setShowDeleteConfirm(null);
      loadEpisodes({
        deviceId: filterDevice || undefined,
        status: filterStatus || undefined,
        modelName: filterModel || undefined,
      });
    } catch (err: any) {
      toast('error', err.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  }, [filterDevice, filterStatus, filterModel, loadEpisodes]);

  const handleCompile = useCallback(async (id: string) => {
    setCompilingId(id);
    try {
      await api.vlmCompileEpisode(id, {
        scriptName: compileName || undefined,
        platform: compilePlatform || undefined,
      });
      toast('success', '编译成功，脚本已生成');
      setShowCompileModal(null);
      setCompileName('');
      setCompilePlatform('dy');
    } catch (err: any) {
      toast('error', err.message || '编译失败');
    } finally {
      setCompilingId(null);
    }
  }, [compileName, compilePlatform]);

  const getDeviceName = (deviceId: string) => {
    return devices.find(d => d.id === deviceId)?.name || deviceId?.slice(0, 8) || '-';
  };

  const uniqueModels = [...new Set(episodes.map(e => e.modelName).filter(Boolean))];

  const STATUS_FILTER_OPTIONS = [
    { key: 'completed', label: '已完成' },
    { key: 'failed', label: '失败' },
    { key: 'running', label: '运行中' },
    { key: 'stopped', label: '已停止' },
  ];

  const filteredEpisodes = useMemo(() => {
    let list = episodes;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        e.episodeId?.toLowerCase().includes(q) ||
        e.taskPrompt?.toLowerCase().includes(q) ||
        e.deviceId?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [episodes, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEpisodes.length / PAGE_SIZE));
  const paginatedEpisodes = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEpisodes.slice(start, start + PAGE_SIZE);
  }, [filteredEpisodes, currentPage]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
          <Bot size={24} className="text-purple-600" />
          VLM Episode 历史
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              showStats
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            统计
          </button>
          <button
            onClick={() => navigate('/vlm')}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={16} />
            新任务
          </button>
        </div>
      </div>

      {/* Stats Dashboard (collapsible) */}
      {showStats && <StatsDashboard />}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜索 Episode ID/指令/设备..."
            className="w-56"
          />
          <select
            value={filterDevice}
            onChange={e => setFilterDevice(e.target.value)}
            className="border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="">全部设备</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <FilterBar
            options={STATUS_FILTER_OPTIONS}
            value={filterStatus}
            onChange={setFilterStatus}
          />
          <select
            value={filterModel}
            onChange={e => setFilterModel(e.target.value)}
            className="border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="">全部模型</option>
            {uniqueModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            onClick={handleFilter}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 transition-colors"
          >
            筛选
          </button>
          {filteredEpisodes.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
              共 {filteredEpisodes.length} 条，第 {currentPage}/{totalPages} 页
            </span>
          )}
        </div>
      </div>

      {/* Episodes Table */}
      {episodesLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-purple-500" />
        </div>
      ) : filteredEpisodes.length === 0 && !searchQuery && !filterDevice && !filterStatus && !filterModel ? (
        <div className="text-center py-20 text-gray-400 dark:text-slate-500">
          <Bot size={48} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-lg">暂无 VLM Episode 记录</p>
          <p className="text-sm mt-1">执行一个 VLM 任务后，记录将在此显示</p>
          <button
            onClick={() => navigate('/vlm')}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={16} />
            创建任务
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">Episode ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">设备</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">任务指令</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">模型</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">状态</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">步数</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">耗时</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">时间</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-slate-400">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {paginatedEpisodes.map(ep => (
                    <tr
                      key={ep.episodeId}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                      onClick={() => navigate(`/vlm/episodes/${ep.episodeId}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400 max-w-32 truncate" title={ep.episodeId}>
                        {ep.episodeId?.slice(0, 12)}...
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
                        {getDeviceName(ep.deviceId)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-400 max-w-48 truncate" title={ep.taskPrompt}>
                        {ep.taskPrompt?.slice(0, 50)}{(ep.taskPrompt?.length || 0) > 50 ? '...' : ''}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">
                        {ep.modelName || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[ep.status] || 'bg-gray-100 text-gray-600'}`}>
                          {ep.status === 'completed' ? <CheckCircle2 size={12} /> :
                           ep.status === 'failed' ? <XCircle size={12} /> :
                           ep.status === 'running' ? <Loader2 size={12} className="animate-spin" /> :
                           <Clock size={12} />}
                          {STATUS_LABELS[ep.status] || ep.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-400 font-mono">
                        {ep.totalSteps}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">
                        {(ep.totalDurationMs / 1000).toFixed(1)}s
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">
                        {new Date(ep.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {ep.status === 'completed' && (
                            <button
                              onClick={() => {
                                setShowCompileModal(ep.episodeId);
                                setCompileName(ep.taskPrompt?.slice(0, 30) || '');
                              }}
                              className="p-1.5 hover:bg-purple-50 text-purple-600 rounded-lg transition-colors"
                              title="编译为脚本"
                            >
                              <FileCode2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => setShowDeleteConfirm(ep.episodeId)}
                            className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm !== null}
        title="确认删除"
        message="确定要删除此 Episode 吗？此操作不可撤销。"
        confirmLabel="删除"
        variant="danger"
        loading={deletingId === showDeleteConfirm}
        onConfirm={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />

      {/* Compile Modal */}
      {showCompileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCompileModal(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <FileCode2 size={20} className="text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">编译为脚本</h3>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">脚本名称</label>
                <input
                  type="text"
                  value={compileName}
                  onChange={e => setCompileName(e.target.value)}
                  placeholder="输入脚本名称"
                  className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">目标平台</label>
                <select
                  value={compilePlatform}
                  onChange={e => setCompilePlatform(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="dy">抖音</option>
                  <option value="ks">快手</option>
                  <option value="wx">微信视频号</option>
                  <option value="xhs">小红书</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCompileModal(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg text-sm text-gray-700 dark:text-slate-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleCompile(showCompileModal)}
                disabled={compilingId === showCompileModal || !compileName.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {compilingId === showCompileModal ? '编译中...' : '编译'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import DeviceList from './pages/DeviceList';
import DeviceDetail from './pages/DeviceDetail';
import TaskList from './pages/TaskList';
import TaskCreate from './pages/TaskCreate';
import AccountList from './pages/AccountList';
import VlmTaskPage from './pages/VlmTaskPage';
import EpisodeListPage from './pages/EpisodeListPage';
import ScriptManager from './pages/ScriptManager';
import ModelConfigPage from './pages/ModelConfigPage';
import KeyMapPage from './pages/KeyMapPage';
import SystemControlPanel from './pages/SystemControlPanel';
import GroupControlPanel from './components/GroupControlPanel';
import EpisodePlayer from './components/EpisodePlayer';
import AdminPanel from './pages/admin/AdminPanel';
import CardKeyManagement from './pages/admin/CardKeyManagement';
import DeviceGroupManagement from './pages/admin/DeviceGroupManagement';
import BatchOperationPanel from './pages/admin/BatchOperationPanel';
import AuditLogViewer from './pages/admin/AuditLogViewer';
import VlmUsageDashboard from './pages/admin/VlmUsageDashboard';
import AlertRuleConfig from './pages/admin/AlertRuleConfig';
import ServerHealthDashboard from './pages/admin/ServerHealthDashboard';
import ConfigManagement from './pages/config/ConfigManagement';
import ConfigGlobalEditor from './pages/config/ConfigGlobalEditor';
import ConfigDeviceEditor from './pages/config/ConfigDeviceEditor';
import ConfigTemplateEditor from './pages/config/ConfigTemplateEditor';
import ConfigAuditLog from './pages/config/ConfigAuditLog';
import type { EpisodeStep } from './components/EpisodePlayer';
import ToastContainer from './components/Toast';
import { api } from './lib/api';
import { ArrowLeft, Loader2 } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/': '设备列表',
  '/tasks': '任务管理',
  '/tasks/new': '创建任务',
  '/accounts': '账号管理',
  '/vlm': 'VLM 任务',
  '/vlm/episodes': 'Episode 历史',
  '/vlm/scripts': '编译脚本',
  '/vlm/models': 'VLM 模型配置',
  '/groups': '群控管理',
  '/keymaps': '键位映射',
  '/settings': '服务控制',
  '/admin': '管理面板',
  '/admin/card-keys': '卡密管理',
  '/admin/groups': '设备分组',
  '/admin/batch': '批量操作',
  '/admin/audit': '审计日志',
  '/admin/vlm-usage': 'VLM 用量统计',
  '/admin/alerts': '告警规则',
  '/admin/health': '服务健康监控',
  '/config': '配置管理',
  '/config/global': '全局配置编辑',
  '/config/device': '设备配置编辑',
  '/config/templates': '配置模板管理',
  '/config/audit': '配置变更审计',
};

function useDocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const base = PAGE_TITLES[location.pathname];
    if (base) {
      document.title = `${base} - PhoneFarm`;
    } else if (location.pathname.startsWith('/devices/')) {
      document.title = `设备详情 - PhoneFarm`;
    } else if (location.pathname.startsWith('/vlm/episodes/')) {
      document.title = `Episode 回放 - PhoneFarm`;
    }
  }, [location.pathname]);
}

function EpisodeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<EpisodeStep[]>([]);
  const [episodeInfo, setEpisodeInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    api.vlmGetEpisode(id)
      .then((data: any) => {
        setEpisodeInfo(data);
        setSteps(data.steps || []);
      })
      .catch((err: any) => {
        setError(err.message || '加载失败');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-purple-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg text-red-500">加载失败</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={() => navigate('/vlm/episodes')}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} /> 返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/vlm/episodes')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} /> 返回 Episode 列表
      </button>

      {episodeInfo && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Episode ID</span>
              <p className="text-gray-900 font-mono text-xs mt-0.5">{episodeInfo.episodeId}</p>
            </div>
            <div>
              <span className="text-gray-500">设备</span>
              <p className="text-gray-900 mt-0.5">{episodeInfo.deviceId || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">模型</span>
              <p className="text-gray-900 mt-0.5">{episodeInfo.modelName || '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">状态</span>
              <p className="text-gray-900 mt-0.5">{episodeInfo.status || '-'}</p>
            </div>
          </div>
          {episodeInfo.taskPrompt && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">任务指令</span>
              <p className="text-sm text-gray-700 mt-0.5">{episodeInfo.taskPrompt}</p>
            </div>
          )}
        </div>
      )}

      <EpisodePlayer steps={steps} />
    </div>
  );
}

function AppInner() {
  useDocumentTitle();
  const updateLiveInfo = useStore(s => s.updateLiveInfo);
  const theme = useStore(s => s.theme);
  const toggleTheme = useStore(s => s.toggleTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useKeyboardShortcuts({
    onToggleTheme: toggleTheme,
    onFocusSearch: () => {
      const searchInput = document.querySelector<HTMLInputElement>('input[type="text"][placeholder*="搜索"]');
      searchInput?.focus();
    },
    onEscape: () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
  });

  const handleWsMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'device_online':
        updateLiveInfo(msg.deviceId, { currentApp: '', battery: 0, screenOn: true });
        break;
      case 'device_offline':
        updateLiveInfo(msg.deviceId, {});
        break;
      case 'device_heartbeat':
        updateLiveInfo(msg.deviceId, {
          battery: msg.battery,
          currentApp: msg.currentApp,
          screenOn: msg.screenOn,
        });
        break;
      case 'device_screenshot':
        updateLiveInfo(msg.deviceId, { screenshot: msg.data });
        break;
      case 'task_status_update':
        updateLiveInfo(msg.deviceId, {
          taskStatus: msg.status,
          taskStep: msg.step,
          taskMessage: msg.message,
        });
        break;
      case 'config_update':
        // Real-time config change notification
        console.log(`[Config] ${msg.configKey} updated (scope=${msg.scope}, v${msg.version})`);
        break;
    }
  }, [updateLiveInfo]);

  const { connectionState } = useWebSocket(handleWsMessage);

  return (
    <Layout connectionState={connectionState}>
      <Routes>
        <Route path="/" element={<DeviceList />} />
        <Route path="/devices/:id" element={<DeviceDetail />} />
        <Route path="/tasks" element={<TaskList />} />
        <Route path="/tasks/new" element={<TaskCreate />} />
        <Route path="/accounts" element={<AccountList />} />
        <Route path="/vlm" element={<VlmTaskPage />} />
        <Route path="/vlm/episodes" element={<EpisodeListPage />} />
        <Route path="/vlm/episodes/:id" element={<EpisodeDetailPage />} />
        <Route path="/vlm/scripts" element={<ScriptManager />} />
        <Route path="/vlm/models" element={<ModelConfigPage />} />
        <Route path="/groups" element={<GroupControlPanel />} />
        <Route path="/keymaps" element={<KeyMapPage />} />
        <Route path="/settings" element={<SystemControlPanel />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/admin/card-keys" element={<CardKeyManagement />} />
        <Route path="/admin/groups" element={<DeviceGroupManagement />} />
        <Route path="/admin/batch" element={<BatchOperationPanel />} />
        <Route path="/admin/audit" element={<AuditLogViewer />} />
        <Route path="/admin/vlm-usage" element={<VlmUsageDashboard />} />
        <Route path="/admin/alerts" element={<AlertRuleConfig />} />
        <Route path="/admin/health" element={<ServerHealthDashboard />} />
        <Route path="/config" element={<ConfigManagement />} />
        <Route path="/config/global" element={<ConfigGlobalEditor />} />
        <Route path="/config/device" element={<ConfigDeviceEditor />} />
        <Route path="/config/templates" element={<ConfigTemplateEditor />} />
        <Route path="/config/audit" element={<ConfigAuditLog />} />
      </Routes>
    </Layout>
  );
}

function App() {
  const isAuthenticated = useStore(s => s.isAuthenticated);

  return (
    <BrowserRouter>
      <ToastContainer />
      {isAuthenticated ? (
        <AppInner />
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;

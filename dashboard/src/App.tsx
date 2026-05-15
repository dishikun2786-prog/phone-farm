import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useCallback, useEffect, useState, useRef, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import type { EpisodeStep } from './components/EpisodePlayer';
import ToastContainer from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { api } from './lib/api';
import { ArrowLeft, Loader2 } from 'lucide-react';
import PortalSidebar from './components/portal/PortalSidebar';

// ── Portal pages ──
const PortalDashboardPage = lazy(() => import('./pages/portal/DashboardPage'));
const PortalDeviceManagementPage = lazy(() => import('./pages/portal/DeviceManagementPage'));
const PortalTaskManagementPage = lazy(() => import('./pages/portal/TaskManagementPage'));
const PortalPlansPage = lazy(() => import('./pages/portal/PlansPage'));
const PortalSubscribePage = lazy(() => import('./pages/portal/SubscribePage'));
const PortalBillingHistoryPage = lazy(() => import('./pages/portal/BillingHistoryPage'));
const PortalCardKeyListPage = lazy(() => import('./pages/portal/CardKeyListPage'));
const PortalCardKeyGeneratePage = lazy(() => import('./pages/portal/CardKeyGeneratePage'));
const PortalUsageAnalyticsPage = lazy(() => import('./pages/portal/UsageAnalyticsPage'));
const PortalApiKeyPage = lazy(() => import('./pages/portal/ApiKeyPage'));
const PortalSupportTicketsPage = lazy(() => import('./pages/portal/SupportTicketsPage'));
const PortalSupportTicketDetail = lazy(() => import('./pages/portal/SupportTicketDetail'));
const PortalAccountSettingsPage = lazy(() => import('./pages/portal/AccountSettingsPage'));
const PortalNewTicketPage = lazy(() => import('./pages/portal/NewTicketPage'));
const PortalApiDocsPage = lazy(() => import('./pages/portal/ApiDocsPage'));
const PortalApiAppsPage = lazy(() => import('./pages/portal/ApiAppsPage'));
const PortalAgentCommissionPage = lazy(() => import('./pages/portal/AgentCommissionPage'));

// ── Route-level code splitting ──
const DeviceList = lazy(() => import('./pages/DeviceList'));
const DeviceDetail = lazy(() => import('./pages/DeviceDetail'));
const TaskList = lazy(() => import('./pages/TaskList'));
const TaskCreate = lazy(() => import('./pages/TaskCreate'));
const AccountList = lazy(() => import('./pages/AccountList'));
const VlmTaskPage = lazy(() => import('./pages/VlmTaskPage'));
const EpisodeListPage = lazy(() => import('./pages/EpisodeListPage'));
const ScriptManager = lazy(() => import('./pages/ScriptManager'));
const ModelConfigPage = lazy(() => import('./pages/ModelConfigPage'));
const KeyMapPage = lazy(() => import('./pages/KeyMapPage'));
const SystemControlPanel = lazy(() => import('./pages/SystemControlPanel'));
const GroupControlPanel = lazy(() => import('./components/GroupControlPanel'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));
const CardKeyManagement = lazy(() => import('./pages/admin/CardKeyManagement'));
const DeviceGroupManagement = lazy(() => import('./pages/admin/DeviceGroupManagement'));
const BatchOperationPanel = lazy(() => import('./pages/admin/BatchOperationPanel'));
const AuditLogViewer = lazy(() => import('./pages/admin/AuditLogViewer'));
const VlmUsageDashboard = lazy(() => import('./pages/admin/VlmUsageDashboard'));
const AlertRuleConfig = lazy(() => import('./pages/admin/AlertRuleConfig'));
const ServerHealthDashboard = lazy(() => import('./pages/admin/ServerHealthDashboard'));
const SystemConfigPage = lazy(() => import('./pages/admin/SystemConfigPage'));
const FeatureFlagsPage = lazy(() => import('./pages/admin/FeatureFlagsPage'));
const InfrastructureMonitorPage = lazy(() => import('./pages/admin/InfrastructureMonitorPage'));
const AgentManagementPage = lazy(() => import('./pages/admin/AgentManagementPage'));
const CommissionSettlementPage = lazy(() => import('./pages/admin/CommissionSettlementPage'));
const CardBatchManagementPage = lazy(() => import('./pages/admin/CardBatchManagementPage'));
const WhitelabelConfigPage = lazy(() => import('./pages/admin/WhitelabelConfigPage'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const PermissionConfigPage = lazy(() => import('./pages/admin/PermissionConfigPage'));
const TenantManagementPage = lazy(() => import('./pages/admin/TenantManagementPage'));
const CreditManagementPage = lazy(() => import('./pages/admin/CreditManagementPage'));
const TokenPricingPage = lazy(() => import('./pages/admin/TokenPricingPage'));
const AssistantUsageDashboard = lazy(() => import('./pages/admin/AssistantUsageDashboard'));
const ConfigManagement = lazy(() => import('./pages/config/ConfigManagement'));
const ConfigGlobalEditor = lazy(() => import('./pages/config/ConfigGlobalEditor'));
const ConfigDeviceEditor = lazy(() => import('./pages/config/ConfigDeviceEditor'));
const ConfigTemplateEditor = lazy(() => import('./pages/config/ConfigTemplateEditor'));
const ConfigAuditLog = lazy(() => import('./pages/config/ConfigAuditLog'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={32} className="animate-spin text-purple-500" />
    </div>
  );
}

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
  '/admin/system-config': '系统配置管理',
  '/admin/feature-flags': '功能开关管理',
  '/admin/infrastructure': '基础设施监控',
  '/admin/users': '用户管理',
  '/admin/permissions': '权限配置',
  '/admin/tenants': '租户管理',
  '/admin/credits': '积分管理',
  '/admin/token-pricing': 'Token 定价',
  '/admin/assistant-usage': 'AI 助手用量',
  '/admin/agents': '代理商管理',
  '/admin/commissions': '佣金结算',
  '/admin/card-batches': '卡密批次',
  '/admin/whitelabel': '白标配置',
  '/register': '注册账号',
  '/config': '配置管理',
  '/config/global': '全局配置编辑',
  '/config/device': '设备配置编辑',
  '/config/templates': '配置模板管理',
  '/config/audit': '配置变更审计',
  '/portal': '门户首页',
  '/portal/devices': '我的设备',
  '/portal/tasks': '我的任务',
  '/portal/usage': '用量统计',
  '/portal/plans': '套餐计划',
  '/portal/plans/subscribe': '订阅支付',
  '/portal/billing': '账单历史',
  '/portal/card-keys': '我的卡密',
  '/portal/card-keys/generate': '生成卡密',
  '/portal/api-keys': 'API Keys',
  '/portal/support': '技术支持',
  '/portal/support/new': '新建工单',
  '/portal/support/:id': '工单详情',
  '/portal/account': '账户设置',
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

function PortalLayout() {
  const location = useLocation();
  const isDetail = location.pathname.startsWith('/portal/support/') && location.pathname !== '/portal/support' && location.pathname !== '/portal/support/new';

  return (
    <div className="flex">
      {!isDetail && <PortalSidebar />}
      <div className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<PortalDashboardPage />} />
            <Route path="/devices" element={<PortalDeviceManagementPage />} />
            <Route path="/tasks" element={<PortalTaskManagementPage />} />
            <Route path="/usage" element={<PortalUsageAnalyticsPage />} />
            <Route path="/plans" element={<PortalPlansPage />} />
            <Route path="/plans/subscribe" element={<PortalSubscribePage />} />
            <Route path="/billing" element={<PortalBillingHistoryPage />} />
            <Route path="/card-keys" element={<PortalCardKeyListPage />} />
            <Route path="/card-keys/generate" element={<PortalCardKeyGeneratePage />} />
            <Route path="/api-keys" element={<PortalApiKeyPage />} />
            <Route path="/api-apps" element={<PortalApiAppsPage />} />
            <Route path="/api-docs" element={<PortalApiDocsPage />} />
            <Route path="/support" element={<PortalSupportTicketsPage />} />
            <Route path="/support/new" element={<PortalNewTicketPage />} />
            <Route path="/support/:id" element={<PortalSupportTicketDetail />} />
            <Route path="/account" element={<PortalAccountSettingsPage />} />
            <Route path="/commissions" element={<PortalAgentCommissionPage />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Routes>
        </Suspense>
      </div>
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

  // Handlers stored in ref to avoid re-registering keyboard listener every render
  const handlersRef = useRef({
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
  handlersRef.current = { ...handlersRef.current, onToggleTheme: toggleTheme };

  useKeyboardShortcuts(handlersRef.current);

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
        console.log(`[Config] ${msg.configKey} updated (scope=${msg.scope}, v${msg.version})`);
        break;
    }
  }, [updateLiveInfo]);

  const { connectionState } = useWebSocket(handleWsMessage);

  return (
    <Layout connectionState={connectionState}>
      <Suspense fallback={<PageLoader />}>
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
          <Route path="/admin/system-config" element={<SystemConfigPage />} />
          <Route path="/admin/feature-flags" element={<FeatureFlagsPage />} />
          <Route path="/admin/infrastructure" element={<InfrastructureMonitorPage />} />
          <Route path="/admin/agents" element={<AgentManagementPage />} />
          <Route path="/admin/commissions" element={<CommissionSettlementPage />} />
          <Route path="/admin/card-batches" element={<CardBatchManagementPage />} />
          <Route path="/admin/whitelabel" element={<WhitelabelConfigPage />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/admin/permissions" element={<PermissionConfigPage />} />
          <Route path="/admin/tenants" element={<TenantManagementPage />} />
          <Route path="/admin/credits" element={<CreditManagementPage />} />
          <Route path="/admin/token-pricing" element={<TokenPricingPage />} />
          <Route path="/admin/assistant-usage" element={<AssistantUsageDashboard />} />
          <Route path="/config" element={<ConfigManagement />} />
          <Route path="/config/global" element={<ConfigGlobalEditor />} />
          <Route path="/config/device" element={<ConfigDeviceEditor />} />
          <Route path="/config/templates" element={<ConfigTemplateEditor />} />
          <Route path="/config/audit" element={<ConfigAuditLog />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/portal/*" element={<PortalLayout />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function App() {
  const isAuthenticated = useStore(s => s.isAuthenticated);
  const logout = useStore(s => s.logout);
  const [tokenValidated, setTokenValidated] = useState(false);

  // Listen for auth-expired events (dispatched by api.ts on 401)
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('phonefarm:auth-expired', handler);
    return () => window.removeEventListener('phonefarm:auth-expired', handler);
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setTokenValidated(true); return; }
    api.health()
      .then(() => setTokenValidated(true))
      .catch(() => { logout(); setTokenValidated(true); });
  }, [logout]);

  if (!tokenValidated) {
    return (
      <BrowserRouter>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-400 text-sm">验证登录状态...</div>
        </div>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ToastContainer />
        {isAuthenticated ? (
          <AppInner />
        ) : (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        )}
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;

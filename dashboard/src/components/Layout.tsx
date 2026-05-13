import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { useState, useEffect, useRef } from 'react';
import ConnectivityBadge from './ConnectivityBadge';
import type { ConnectionState } from '../hooks/useWebSocket';
import {
  Smartphone, ListTodo, Shield, Bot, LogOut,
  Play, History, FileCode2, ChevronDown, Menu, X, Settings2,
  Layers, Keyboard, ShieldCheck, Wrench,
  Key, Server, AlertTriangle, BarChart3, Search, TabletSmartphone, ListChecks,
  Globe, Package, Clock, Sun, Moon, Sliders, Activity, ToggleLeft,
} from 'lucide-react';

export default function Layout({ children, connectionState }: { children: React.ReactNode; connectionState: ConnectionState }) {
  const logout = useStore(s => s.logout);
  const user = useStore(s => s.user);
  const devices = useStore(s => s.devices);
  const theme = useStore(s => s.theme);
  const toggleTheme = useStore(s => s.toggleTheme);
  const navigate = useNavigate();
  const location = useLocation();

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  const deviceMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  const isAdminUser = user?.role === 'super_admin' || user?.role === 'admin';
  const isAiActive = location.pathname.startsWith('/vlm');
  const isDeviceActive = ['/', '/groups', '/keymaps'].some(p => location.pathname === p || location.pathname.startsWith('/devices/'));
  const isToolsActive = location.pathname === '/settings' || location.pathname.startsWith('/config') || location.pathname === '/admin/infrastructure' || location.pathname === '/admin/feature-flags';
  const isAdminActive = location.pathname.startsWith('/admin');

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) setAiMenuOpen(false);
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) setDeviceMenuOpen(false);
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) setToolsMenuOpen(false);
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) setAdminMenuOpen(false);
    };
    if (aiMenuOpen || deviceMenuOpen || toolsMenuOpen || adminMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [aiMenuOpen, deviceMenuOpen, toolsMenuOpen, adminMenuOpen]);

  // Close on route change
  useEffect(() => {
    setAiMenuOpen(false);
    setDeviceMenuOpen(false);
    setToolsMenuOpen(false);
    setAdminMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const aiLinks = [
    { to: '/vlm', label: '执行任务', icon: Play },
    { to: '/vlm/episodes', label: '历史记录', icon: History },
    { to: '/vlm/scripts', label: '编译脚本', icon: FileCode2 },
    { to: '/vlm/models', label: '模型配置', icon: Settings2 },
  ];

  const deviceLinks = [
    { to: '/', label: '设备列表', icon: Smartphone },
    { to: '/groups', label: '群控管理', icon: Layers },
    { to: '/keymaps', label: '键位映射', icon: Keyboard },
  ];

  const toolsLinks = [
    { to: '/settings', label: '服务控制', icon: Settings2 },
    { to: '/admin/infrastructure', label: '基础设施', icon: Activity },
    { to: '/admin/feature-flags', label: '功能开关', icon: ToggleLeft },
    { to: '/config', label: '配置管理', icon: Globe },
    { to: '/config/global', label: '全局配置', icon: Settings2 },
    { to: '/config/device', label: '设备配置', icon: Smartphone },
    { to: '/config/templates', label: '配置模板', icon: Package },
    { to: '/config/audit', label: '变更审计', icon: Clock },
  ];

  const adminLinks = [
    { to: '/admin', label: '管理总览', icon: ShieldCheck },
    { to: '/admin/card-keys', label: '卡密管理', icon: Key },
    { to: '/admin/groups', label: '设备分组', icon: TabletSmartphone },
    { to: '/admin/batch', label: '批量操作', icon: ListChecks },
    { to: '/admin/audit', label: '审计日志', icon: Search },
    { to: '/admin/vlm-usage', label: 'VLM 用量', icon: BarChart3 },
    { to: '/admin/alerts', label: '告警规则', icon: AlertTriangle },
    { to: '/admin/health', label: '服务健康', icon: Server },
    { to: '/admin/system-config', label: '系统配置', icon: Sliders },
    { to: '/admin/feature-flags', label: '功能开关', icon: ToggleLeft },
    { to: '/admin/infrastructure', label: '基础监控', icon: Activity },
  ];

  const navLinkCls = (isActive: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      isActive ? 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-200'
    }`;

  const mobileNavLinkCls = (isActive: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
    }`;

  const navContent = (
    <>
      {/* Device Dropdown */}
      <div className="relative" ref={deviceMenuRef}>
        <button
          onClick={() => { setDeviceMenuOpen(!deviceMenuOpen); setAiMenuOpen(false); setToolsMenuOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isDeviceActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Smartphone size={16} />
          设备
          {onlineCount > 0 && (
            <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">{onlineCount}</span>
          )}
          <ChevronDown size={12} className={`transition-transform ${deviceMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {deviceMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1 w-40 z-50">
            {deviceLinks.map(link => {
              const isActive = location.pathname === link.to;
              return (
                <button key={link.to}
                  onClick={() => { navigate(link.to); setDeviceMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    isActive ? 'bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-slate-100 font-medium' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <link.icon size={14} />{link.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <NavLink to="/tasks" className={({ isActive }) => navLinkCls(isActive)}>
        <ListTodo size={16} />
        任务
      </NavLink>

      {/* AI Dropdown */}
      <div className="relative" ref={aiMenuRef}>
        <button
          onClick={() => { setAiMenuOpen(!aiMenuOpen); setDeviceMenuOpen(false); setToolsMenuOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isAiActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Bot size={16} className={isAiActive ? 'text-purple-600' : ''} />
          AI
          <ChevronDown size={12} className={`transition-transform ${aiMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {aiMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1 w-40 z-50">
            {aiLinks.map(link => {
              const isActive = location.pathname === link.to;
              return (
                <button key={link.to}
                  onClick={() => { navigate(link.to); setAiMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    isActive ? 'bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-slate-100 font-medium' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <link.icon size={14} />{link.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tools Dropdown */}
      <div className="relative" ref={toolsMenuRef}>
        <button
          onClick={() => { setToolsMenuOpen(!toolsMenuOpen); setAiMenuOpen(false); setDeviceMenuOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isToolsActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <Wrench size={16} />
          工具
          <ChevronDown size={12} className={`transition-transform ${toolsMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {toolsMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1 w-40 z-50">
            {toolsLinks.map(link => {
              const isActive = location.pathname === link.to;
              return (
                <button key={link.to}
                  onClick={() => { navigate(link.to); setToolsMenuOpen(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    isActive ? 'bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-slate-100 font-medium' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <link.icon size={14} />{link.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <NavLink to="/accounts" className={({ isActive }) => navLinkCls(isActive)}>
        <Shield size={16} />
        账号
      </NavLink>

      {/* Admin Dropdown */}
      {isAdminUser && (
        <div className="relative" ref={adminMenuRef}>
          <button
            onClick={() => { setAdminMenuOpen(!adminMenuOpen); setAiMenuOpen(false); setDeviceMenuOpen(false); setToolsMenuOpen(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isAdminActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <ShieldCheck size={16} />
            管理
            <ChevronDown size={12} className={`transition-transform ${adminMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {adminMenuOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1 w-44 z-50">
              {adminLinks.map(link => {
                const isActive = location.pathname === link.to;
                return (
                  <button key={link.to}
                    onClick={() => { navigate(link.to); setAdminMenuOpen(false); }}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <link.icon size={14} />{link.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );

  const mobileNavContent = (
    <>
      <NavLink to="/" className={({ isActive }) => mobileNavLinkCls(isActive)} onClick={() => setMobileMenuOpen(false)}>
        <Smartphone size={18} />
        设备
        {onlineCount > 0 && (
          <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center ml-auto">
            {onlineCount}
          </span>
        )}
      </NavLink>

      <NavLink to="/tasks" className={({ isActive }) => mobileNavLinkCls(isActive)} onClick={() => setMobileMenuOpen(false)}>
        <ListTodo size={18} />
        任务
      </NavLink>

      <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">AI 智能</div>

      {aiLinks.map(link => {
        const isActive = location.pathname === link.to;
        return (
          <button
            key={link.to}
            onClick={() => { navigate(link.to); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-slate-100 font-medium'
                : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <link.icon size={18} className={isActive ? 'text-purple-600' : ''} />
            {link.label}
          </button>
        );
      })}

      <NavLink to="/accounts" className={({ isActive }) => mobileNavLinkCls(isActive)} onClick={() => setMobileMenuOpen(false)}>
        <Shield size={18} />
        账号
      </NavLink>

      {isAdminUser && (
        <>
          <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">管理面板</div>
          {adminLinks.map(link => {
            const isActive = location.pathname === link.to;
            return (
              <button
                key={link.to}
                onClick={() => { navigate(link.to); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <link.icon size={18} />
                {link.label}
              </button>
            );
          })}
        </>
      )}

      <hr className="my-2 border-gray-100" />

      <button
        onClick={toggleTheme}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors w-full"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        {theme === 'dark' ? '浅色主题' : '暗色主题'}
      </button>

      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors w-full"
      >
        <LogOut size={18} />
        退出
      </button>

      <div className="px-4 mt-2">
        <ConnectivityBadge state={connectionState} />
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Top navbar */}
      <nav className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-gray-900 dark:text-slate-100">PhoneFarm</h1>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navContent}
            </div>
          </div>

          {/* Desktop right section */}
          <div className="hidden md:flex items-center gap-3">
            <ConnectivityBadge state={connectionState} />
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title={theme === 'dark' ? '切换到浅色主题' : '切换到暗色主题'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut size={16} />
              退出
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-600 dark:text-slate-300 transition-colors"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile slide-out menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute top-14 right-0 bottom-0 w-72 bg-white dark:bg-slate-800 shadow-xl overflow-y-auto">
            <div className="p-3 flex flex-col gap-0.5">
              {mobileNavContent}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="pt-14">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}

import { useLocation, useNavigate } from 'react-router-dom';

const MENU_ITEMS = [
  { label: '门户首页', path: '/portal', icon: 'home' },
  { label: '我的设备', path: '/portal/devices', icon: 'smartphone' },
  { label: '我的任务', path: '/portal/tasks', icon: 'play-circle' },
  { label: '用量统计', path: '/portal/usage', icon: 'bar-chart' },
  { label: '套餐计划', path: '/portal/plans', icon: 'package' },
  { label: '账单历史', path: '/portal/billing', icon: 'credit-card' },
  { label: '我的卡密', path: '/portal/card-keys', icon: 'key' },
  { label: 'API Keys', path: '/portal/api-keys', icon: 'lock' },
  { label: 'API 应用', path: '/portal/api-apps', icon: 'code' },
  { label: 'API 文档', path: '/portal/api-docs', icon: 'file-text' },
  { label: '技术支持', path: '/portal/support', icon: 'help-circle' },
  { label: '账户设置', path: '/portal/account', icon: 'settings' },
];

export default function PortalSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="w-56 bg-white border-r min-h-screen p-4">
      <div className="mb-6 px-2">
        <h2 className="text-lg font-bold">客户门户</h2>
        <p className="text-xs text-gray-400">PhoneFarm Portal</p>
      </div>
      <nav className="space-y-1">
        {MENU_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

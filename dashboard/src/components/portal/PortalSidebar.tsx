import { NavLink } from 'react-router-dom';

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
  return (
    <aside className="w-full lg:w-56 bg-white dark:bg-slate-800 border-r dark:border-slate-700 min-h-screen p-4">
      <div className="mb-6 px-2">
        <h2 className="text-lg font-bold dark:text-slate-100">客户门户</h2>
        <p className="text-xs text-gray-400 dark:text-slate-500">PhoneFarm Portal</p>
      </div>
      <nav className="space-y-1">
        {MENU_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-200'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

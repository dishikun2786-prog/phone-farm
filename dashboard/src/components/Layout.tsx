import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Smartphone, ListTodo, Shield, LogOut } from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const logout = useStore(s => s.logout);
  const devices = useStore(s => s.devices);
  const navigate = useNavigate();

  const onlineCount = devices.filter(d => d.status === 'online').length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-gray-900">PhoneFarm</h1>
            <div className="flex items-center gap-1">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <Smartphone size={16} />
                设备
                {onlineCount > 0 && (
                  <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                    {onlineCount}
                  </span>
                )}
              </NavLink>
              <NavLink
                to="/tasks"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <ListTodo size={16} />
                任务
              </NavLink>
              <NavLink
                to="/accounts"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <Shield size={16} />
                账号
              </NavLink>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
          >
            <LogOut size={16} />
            退出
          </button>
        </div>
      </nav>
      <main className="pt-14">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}

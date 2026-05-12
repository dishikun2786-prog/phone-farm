import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Eye, EyeOff, Loader2, WifiOff } from 'lucide-react';


export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const login = useStore(s => s.login);
  const loginLoading = useStore(s => s.loginLoading);
  const loginError = useStore(s => s.loginError);
  const navigate = useNavigate();

  const isNetworkError = loginError && (loginError.includes('网络') || loginError.includes('连接') || loginError.includes('超时'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/');
    } catch {
      // error handled by store (toast + loginError field)
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-1">PhoneFarm</h1>
        <p className="text-gray-500 text-center text-sm mb-6">手机群控管理平台</p>

        {loginError && (
          <div className={`text-sm rounded-lg px-4 py-2 mb-4 ${
            isNetworkError
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-red-50 text-red-600'
          }`}>
            {isNetworkError && <WifiOff size={14} className="inline mr-1.5 mb-0.5" />}
            {loginError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            {loginLoading && <Loader2 size={16} className="animate-spin" />}
            {loginLoading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">PhoneFarm v1.0.0</p>
      </div>
    </div>
  );
}

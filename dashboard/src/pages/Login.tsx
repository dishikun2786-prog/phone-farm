import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store';
import { Eye, EyeOff, Loader2, WifiOff, Smartphone, Key } from 'lucide-react';

type LoginMode = 'password' | 'sms';

export default function Login() {
  const [mode, setMode] = useState<LoginMode>('password');
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const login = useStore(s => s.login);
  const loginByPhone = useStore(s => s.loginByPhone);
  const sendSmsCode = useStore(s => s.sendSmsCode);
  const loginLoading = useStore(s => s.loginLoading);
  const loginError = useStore(s => s.loginError);
  const smsSending = useStore(s => s.smsSending);
  const smsCooldown = useStore(s => s.smsCooldown);
  const navigate = useNavigate();

  const isNetworkError = loginError && (loginError.includes('网络') || loginError.includes('连接') || loginError.includes('超时'));

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(account, password);
      navigate('/');
    } catch { /* error handled by store */ }
  };

  const handleSmsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !smsCode) return;
    try {
      await loginByPhone(phone, smsCode);
      navigate('/');
    } catch { /* error handled by store */ }
  };

  const handleSendSms = async () => {
    if (smsCooldown > 0 || smsSending) return;
    try {
      await sendSmsCode(phone, 'login');
    } catch { /* error handled via toast */ }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-1 text-gray-900 dark:text-white">PhoneFarm</h1>
        <p className="text-gray-500 dark:text-slate-400 text-center text-sm mb-6">手机群控管理平台</p>

        {/* Login mode tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 mb-5">
          <button
            onClick={() => setMode('password')}
            className={`flex-1 pb-2.5 text-sm font-medium border-b-2 transition-colors inline-flex items-center justify-center gap-1.5 ${
              mode === 'password'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700'
            }`}
          >
            <Key size={15} /> 密码登录
          </button>
          <button
            onClick={() => setMode('sms')}
            className={`flex-1 pb-2.5 text-sm font-medium border-b-2 transition-colors inline-flex items-center justify-center gap-1.5 ${
              mode === 'sms'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700'
            }`}
          >
            <Smartphone size={15} /> 短信登录
          </button>
        </div>

        {loginError && (
          <div className={`text-sm rounded-lg px-4 py-2 mb-4 ${
            isNetworkError
              ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
              : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
          }`}>
            {isNetworkError && <WifiOff size={14} className="inline mr-1.5 mb-0.5" />}
            {loginError}
          </div>
        )}

        {mode === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">用户名 / 手机号</label>
              <input
                type="text"
                value={account}
                onChange={e => setAccount(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入用户名或手机号"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
        ) : (
          <form onSubmit={handleSmsLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">手机号</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入11位手机号"
                pattern="1[3-9]\d{9}"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={smsCode}
                  onChange={e => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="flex-1 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="6位验证码"
                  maxLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={handleSendSms}
                  disabled={smsCooldown > 0 || smsSending || phone.length !== 11}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors whitespace-nowrap min-w-[100px]"
                >
                  {smsSending ? <Loader2 size={14} className="animate-spin inline" /> :
                   smsCooldown > 0 ? `${smsCooldown}秒` : '获取验证码'}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loginLoading || smsCode.length !== 6}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              {loginLoading && <Loader2 size={16} className="animate-spin" />}
              {loginLoading ? '登录中...' : '登录'}
            </button>
          </form>
        )}

        <div className="mt-5 text-center">
          <Link to="/register" className="text-sm text-blue-600 hover:text-blue-700 transition-colors">
            没有账号？立即注册
          </Link>
        </div>

        <p className="text-xs text-gray-400 dark:text-slate-500 text-center mt-4">PhoneFarm v1.0.0</p>
      </div>
    </div>
  );
}

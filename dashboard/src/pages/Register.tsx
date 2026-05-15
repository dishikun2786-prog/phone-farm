import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store';
import { Loader2, CheckCircle } from 'lucide-react';

export default function Register() {
  const [step, setStep] = useState<'phone' | 'info'>('phone');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const register = useStore(s => s.register);
  const sendSmsCode = useStore(s => s.sendSmsCode);
  const loginLoading = useStore(s => s.loginLoading);
  const loginError = useStore(s => s.loginError);
  const smsSending = useStore(s => s.smsSending);
  const smsCooldown = useStore(s => s.smsCooldown);
  const navigate = useNavigate();

  const handleSendSms = async () => {
    if (smsCooldown > 0 || smsSending || phone.length !== 11) return;
    try {
      await sendSmsCode(phone, 'register');
    } catch { /* handled by store */ }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (smsCode.length !== 6) return;
    setStep('info');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register({
        phone,
        code: smsCode,
        username: username || undefined,
        password: password || undefined,
      });
      navigate('/');
    } catch { /* handled by store */ }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-1 text-gray-900 dark:text-white">创建账号</h1>
        <p className="text-gray-500 dark:text-slate-400 text-center text-sm mb-6">
          {step === 'phone' ? '手机号注册' : '设置账号信息'}
        </p>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step === 'phone' ? 'bg-blue-600 text-white' : 'bg-green-500 text-white'
          }`}>
            {step === 'info' ? <CheckCircle size={16} /> : '1'}
          </div>
          <div className="w-8 h-px bg-gray-300 dark:bg-slate-600" />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step === 'info' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-500'
          }`}>
            2
          </div>
        </div>

        {loginError && (
          <div className="text-sm rounded-lg px-4 py-2 mb-4 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {loginError}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
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
              disabled={smsCode.length !== 6}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              下一步
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                用户名 <span className="text-gray-400 font-normal">(选填)</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="2-32个字符，不填自动生成"
                minLength={2}
                maxLength={32}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                密码 <span className="text-gray-400 font-normal">(选填)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="8-128位，不填则短信登录"
                minLength={8}
                maxLength={128}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
              未设置密码可使用短信验证码直接登录。
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              {loginLoading && <Loader2 size={16} className="animate-spin" />}
              {loginLoading ? '注册中...' : '完成注册'}
            </button>
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
            >
              返回修改手机号
            </button>
          </form>
        )}

        <div className="mt-5 text-center">
          <Link to="/login" className="text-sm text-blue-600 hover:text-blue-700 transition-colors">
            已有账号？立即登录
          </Link>
        </div>
      </div>
    </div>
  );
}

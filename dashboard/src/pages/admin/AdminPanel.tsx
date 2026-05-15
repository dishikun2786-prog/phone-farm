import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/PageWrapper';
import { Key, Layers, Play, ShieldCheck, BarChart3, Bell, Server, Users, Shield, Coins, DollarSign, MessageSquare, Sliders, ToggleLeft, Activity } from 'lucide-react';

const ADMIN_MODULES = [
  { key: 'users', label: '用户管理', desc: '用户列表/角色管理/禁用启用', icon: Users, path: '/admin/users', color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/30' },
  { key: 'cardKeys', label: '卡密管理', desc: '批量生成/查询/导出/禁用卡密', icon: Key, path: '/admin/card-keys', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
  { key: 'groups', label: '设备分组', desc: '创建分组/拖拽添加设备/批量操作', icon: Layers, path: '/admin/groups', color: 'text-green-600 bg-green-50 dark:bg-green-900/30' },
  { key: 'batch', label: '批量操作', desc: '批量脚本部署/配置下发/重启/截图', icon: Play, path: '/admin/batch', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30' },
  { key: 'audit', label: '审计日志', desc: '按时间/设备/操作类型筛选查询', icon: Shield, path: '/admin/audit', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30' },
  { key: 'vlmUsage', label: 'VLM用量', desc: '调用量图表/按模型下钻/成本估算', icon: BarChart3, path: '/admin/vlm-usage', color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/30' },
  { key: 'alerts', label: '告警规则', desc: '配置告警条件/通知渠道/历史查询', icon: Bell, path: '/admin/alerts', color: 'text-red-600 bg-red-50 dark:bg-red-900/30' },
  { key: 'health', label: '服务健康', desc: 'CPU/内存/WS连接/消息吞吐监控', icon: Server, path: '/admin/health', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' },
  { key: 'credits', label: '积分管理', desc: '积分概览/手动发放/交易记录查询', icon: Coins, path: '/admin/credits', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
  { key: 'tokenPricing', label: 'Token 定价', desc: '各模型 Token 消耗定价配置管理', icon: DollarSign, path: '/admin/token-pricing', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
  { key: 'assistantUsage', label: 'AI 助手用量', desc: '会话量/步骤/积分消耗/错误分析', icon: MessageSquare, path: '/admin/assistant-usage', color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30' },
  { key: 'systemConfig', label: '系统配置', desc: '全局/设备/模板三级配置管理', icon: Sliders, path: '/admin/system-config', color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30' },
  { key: 'featureFlags', label: '功能开关', desc: '按模块开关功能/一键启用禁用', icon: ToggleLeft, path: '/admin/feature-flags', color: 'text-lime-600 bg-lime-50 dark:bg-lime-900/30' },
  { key: 'infrastructure', label: '基础设施监控', desc: 'PG/Redis/NATS/MinIO 连接状态', icon: Activity, path: '/admin/infrastructure', color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30' },
] as const;

export default function AdminPanel() {
  const navigate = useNavigate();

  return (
    <PageWrapper title="管理面板">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ADMIN_MODULES.map((mod) => (
          <button
            key={mod.key}
            onClick={() => navigate(mod.path)}
            className="text-left p-5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-md transition-all duration-200 group"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${mod.color}`}>
              <mod.icon size={20} />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-1 group-hover:text-blue-600 transition-colors">{mod.label}</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">{mod.desc}</p>
          </button>
        ))}
      </div>
    </PageWrapper>
  );
}

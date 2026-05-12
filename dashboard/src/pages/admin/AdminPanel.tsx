import { useNavigate } from 'react-router-dom';
import PageWrapper from '../../components/PageWrapper';
import { Key, Layers, Play, ShieldCheck, Activity, BarChart3, Bell, Server } from 'lucide-react';

const ADMIN_MODULES = [
  { key: 'cardKeys', label: '卡密管理', desc: '批量生成/查询/导出/禁用卡密', icon: Key, path: '/admin/card-keys', color: 'text-blue-600 bg-blue-50' },
  { key: 'groups', label: '设备分组', desc: '创建分组/拖拽添加设备/批量操作', icon: Layers, path: '/admin/groups', color: 'text-green-600 bg-green-50' },
  { key: 'batch', label: '批量操作', desc: '批量脚本部署/配置下发/重启/截图', icon: Play, path: '/admin/batch', color: 'text-purple-600 bg-purple-50' },
  { key: 'audit', label: '审计日志', desc: '按时间/设备/操作类型筛选查询', icon: ShieldCheck, path: '/admin/audit', color: 'text-orange-600 bg-orange-50' },
  { key: 'vlmUsage', label: 'VLM用量', desc: '调用量图表/按模型下钻/成本估算', icon: BarChart3, path: '/admin/vlm-usage', color: 'text-cyan-600 bg-cyan-50' },
  { key: 'alerts', label: '告警规则', desc: '配置告警条件/通知渠道/历史查询', icon: Bell, path: '/admin/alerts', color: 'text-red-600 bg-red-50' },
  { key: 'health', label: '服务健康', desc: 'CPU/内存/WS连接/消息吞吐监控', icon: Server, path: '/admin/health', color: 'text-indigo-600 bg-indigo-50' },
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
            className="text-left p-5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-md transition-all duration-200 group"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${mod.color}`}>
              <mod.icon size={20} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">{mod.label}</h3>
            <p className="text-sm text-gray-500">{mod.desc}</p>
          </button>
        ))}
      </div>
    </PageWrapper>
  );
}

import { useState, useEffect } from 'react';
import PageWrapper from '../../components/PageWrapper';
import { api } from '../../lib/api';
import { toast } from '../../hooks/useToast';
import { Coins, ArrowUpCircle, ArrowDownCircle, Users, Search, X } from 'lucide-react';

interface CreditOverview {
  totalUsers: number;
  totalCreditsIssued: number;
  totalCreditsSpent: number;
  activeBalance: number;
  byPlan: Record<string, { users: number; credits: number }>;
}

interface CreditTransaction {
  id: string;
  userId: string;
  username: string;
  type: 'grant' | 'consume' | 'refund' | 'expire';
  amount: number;
  balanceAfter: number;
  reason: string;
  sessionId?: string;
  createdAt: string;
}

export default function CreditManagementPage() {
  const [overview, setOverview] = useState<CreditOverview | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalTx, setTotalTx] = useState(0);

  // Grant modal
  const [showGrant, setShowGrant] = useState(false);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [granting, setGranting] = useState(false);

  // Search
  const [searchUser, setSearchUser] = useState('');

  const PAGE_SIZE = 20;

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { loadTransactions(); }, [page, searchUser]);

  async function loadOverview() {
    try {
      const data = await api.request('/admin/credits/overview') as CreditOverview;
      setOverview(data);
    } catch { toast('error', '加载积分概览失败'); }
    finally { setLoading(false); }
  }

  async function loadTransactions() {
    setTxLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      if (searchUser) params.set('keyword', searchUser);
      const data = await api.request(`/admin/credits/transactions?${params.toString()}`) as { transactions: CreditTransaction[]; total: number };
      setTransactions(data.transactions);
      setTotalTx(data.total);
    } catch { toast('error', '加载交易记录失败'); }
    finally { setTxLoading(false); }
  }

  async function handleGrant() {
    if (!grantUserId || !grantAmount) return;
    setGranting(true);
    try {
      await api.request('/admin/credits/grant', {
        method: 'POST',
        body: JSON.stringify({ userId: grantUserId, amount: Number(grantAmount), reason: grantReason || '管理员手动发放' }),
      });
      toast('success', `成功发放 ${grantAmount} 积分`);
      setShowGrant(false);
      setGrantUserId('');
      setGrantAmount('');
      setGrantReason('');
      loadOverview();
      loadTransactions();
    } catch { toast('error', '发放积分失败'); }
    finally { setGranting(false); }
  }

  if (loading) return <PageWrapper title="积分管理"><p className="text-gray-400 dark:text-slate-500 text-center py-12">加载中...</p></PageWrapper>;

  const totalPages = Math.ceil(totalTx / PAGE_SIZE);

  return (
    <PageWrapper title="积分管理">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Users size={16} /><span className="text-xs">用户总数</span></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{overview?.totalUsers?.toLocaleString() ?? '-'}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><ArrowUpCircle size={16} /><span className="text-xs">累计发放</span></div>
          <div className="text-2xl font-bold text-green-600">{overview?.totalCreditsIssued?.toLocaleString() ?? '-'}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><ArrowDownCircle size={16} /><span className="text-xs">累计消费</span></div>
          <div className="text-2xl font-bold text-orange-600">{overview?.totalCreditsSpent?.toLocaleString() ?? '-'}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 mb-1"><Coins size={16} /><span className="text-xs">活跃余额</span></div>
          <div className="text-2xl font-bold text-blue-600">{overview?.activeBalance?.toLocaleString() ?? '-'}</div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => setShowGrant(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Coins size={16} /> 发放积分
        </button>
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索用户..."
            value={searchUser}
            onChange={e => { setSearchUser(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* By Plan Distribution */}
      {overview?.byPlan && Object.keys(overview.byPlan).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 mb-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-slate-100">按套餐分布</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(overview.byPlan).map(([plan, data]) => (
              <div key={plan} className="p-3 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">{plan}</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{data.users} 用户</div>
                <div className="text-xs text-gray-400 dark:text-slate-500">{data.credits.toLocaleString()} 积分</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-slate-100">交易记录</h3>
        </div>
        {txLoading ? (
          <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-12">加载中...</p>
        ) : transactions.length === 0 ? (
          <p className="text-gray-400 dark:text-slate-500 text-sm text-center py-12">暂无交易记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">用户</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">类型</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">数量</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">余额</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">原因</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-slate-400 text-xs">时间</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-2.5 text-gray-900 dark:text-slate-100 font-medium">{tx.username}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        tx.type === 'grant' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        tx.type === 'refund' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        tx.type === 'expire' ? 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400' :
                        'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                      }`}>
                        {tx.type === 'grant' ? '发放' : tx.type === 'consume' ? '消费' : tx.type === 'refund' ? '退款' : '过期'}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-900 dark:text-slate-100">{tx.balanceAfter.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 max-w-[200px] truncate">{tx.reason || '-'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400 dark:text-slate-500 text-xs whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-700">
            <span className="text-xs text-gray-400 dark:text-slate-500">共 {totalTx} 条记录</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-2 py-1 text-xs border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 text-gray-700 dark:text-slate-300">
                上一页
              </button>
              <span className="px-2 py-1 text-xs text-gray-500 dark:text-slate-400">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-2 py-1 text-xs border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 text-gray-700 dark:text-slate-300">
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grant Modal */}
      {showGrant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !granting && setShowGrant(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-slate-100">发放积分</h3>
              <button onClick={() => !granting && setShowGrant(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-400"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">用户ID</label>
                <input type="text" value={grantUserId} onChange={e => setGrantUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="输入用户ID" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">积分数量</label>
                <input type="number" value={grantAmount} onChange={e => setGrantAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="输入积分数" min="1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">原因(可选)</label>
                <input type="text" value={grantReason} onChange={e => setGrantReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="发放原因" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowGrant(false)} disabled={granting}
                className="px-4 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300">
                取消
              </button>
              <button onClick={handleGrant} disabled={granting || !grantUserId || !grantAmount}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {granting ? '发放中...' : '确认发放'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

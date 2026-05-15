import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';

interface Order {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paidAt: string | null;
  createdAt: string;
}

interface Subscription {
  id: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  deviceCount: number;
}

interface Plan {
  id: string;
  name: string;
  tier: string;
  monthlyPriceCents: number;
}

export default function BillingHistoryPage() {
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get('paid') === 'true';

  const [orders, setOrders] = useState<Order[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.request('/api/v2/billing/orders').catch(() => ({ orders: [] })),
      api.request('/api/v2/billing/subscription').catch(() => ({ subscription: null, plan: null })),
    ]).then(([orderData, subData]: any[]) => {
      setOrders(orderData.orders || []);
      setSubscription(subData.subscription);
      setPlan(subData.plan);
    }).catch((err: any) => setError(err.message || '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">账单历史</h1>

      {justPaid && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6">支付成功！您的套餐已开通。</div>
      )}
      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

      {/* Current subscription status */}
      {subscription && plan && (
        <div className="border rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3">当前套餐</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold">{plan.name} ({plan.tier})</p>
              <p className="text-gray-500 text-sm">
                {new Date(subscription.currentPeriodStart).toLocaleDateString()} ~ {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <span className={`px-3 py-1 rounded-full text-sm ${
                subscription.status === 'active' ? 'bg-green-100 text-green-700' :
                subscription.status === 'past_due' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {subscription.status === 'active' ? '生效中' :
                 subscription.status === 'past_due' ? '待续费' :
                 subscription.status === 'cancelled' ? '已取消' : subscription.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Order history */}
      <h2 className="text-lg font-semibold mb-4">订单记录</h2>
      {orders.length === 0 ? (
        <p className="text-gray-400">暂无订单记录</p>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 text-sm font-medium text-gray-500">订单号</th>
                <th className="text-left p-4 text-sm font-medium text-gray-500">金额</th>
                <th className="text-left p-4 text-sm font-medium text-gray-500">支付方式</th>
                <th className="text-left p-4 text-sm font-medium text-gray-500">状态</th>
                <th className="text-left p-4 text-sm font-medium text-gray-500">时间</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order: any) => (
                <tr key={order.id} className="border-t">
                  <td className="p-4 text-sm font-mono">{order.id?.slice(0, 8)}...</td>
                  <td className="p-4">{(order.amountCents / 100).toFixed(2)} {order.currency}</td>
                  <td className="p-4 text-sm">{order.paymentMethod === 'wechat_pay' ? '微信支付' : order.paymentMethod === 'alipay' ? '支付宝' : order.paymentMethod || '-'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      order.status === 'paid' ? 'bg-green-100 text-green-700' :
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {order.status === 'paid' ? '已支付' :
                       order.status === 'pending' ? '待支付' :
                       order.status === 'refunded' ? '已退款' : order.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-500">
                    {order.paidAt ? new Date(order.paidAt).toLocaleDateString() : new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

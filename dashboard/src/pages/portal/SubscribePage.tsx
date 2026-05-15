import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import QRCodeModal from '../../components/payment/QRCodeModal';

export default function SubscribePage() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan') || '';
  const navigate = useNavigate();

  const [paymentMethod, setPaymentMethod] = useState<'wechat_pay' | 'alipay'>('wechat_pay');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.createTenant({ planId, paymentMethod } as any);
      // Actually use the billing order API
      const data = await api.request('/api/v2/billing/orders', {
        method: 'POST',
        body: JSON.stringify({ planId, paymentMethod }),
      });
      if (data.qrCode || data.payUrl) {
        setQrCode(data.qrCode || data.payUrl);
        setOrderId(data.orderId);
      }
    } catch (err: any) {
      setError(err.message || '下单失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentComplete = () => {
    navigate('/portal/billing?paid=true');
  };

  return (
    <div className="max-w-lg mx-auto p-6">
      <button onClick={() => navigate(-1)} className="text-blue-500 mb-4 flex items-center gap-1">
        &larr; 返回套餐选择
      </button>

      <h1 className="text-2xl font-bold mb-6">确认订阅</h1>

      <div className="border rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">选择支付方式</h2>
        <div className="space-y-3">
          <label className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer ${paymentMethod === 'wechat_pay' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
            <input
              type="radio"
              name="payment"
              value="wechat_pay"
              checked={paymentMethod === 'wechat_pay'}
              onChange={() => setPaymentMethod('wechat_pay')}
            />
            <span className="font-medium">微信支付</span>
          </label>
          <label className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer ${paymentMethod === 'alipay' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
            <input
              type="radio"
              name="payment"
              value="alipay"
              checked={paymentMethod === 'alipay'}
              onChange={() => setPaymentMethod('alipay')}
            />
            <span className="font-medium">支付宝</span>
          </label>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

      <button
        onClick={handleSubscribe}
        disabled={loading || !planId}
        className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {loading ? '正在创建订单...' : '确认支付'}
      </button>

      {qrCode && (
        <QRCodeModal
          qrCode={qrCode}
          orderId={orderId}
          paymentMethod={paymentMethod}
          onClose={() => { setQrCode(null); setOrderId(null); }}
          onComplete={handlePaymentComplete}
        />
      )}
    </div>
  );
}

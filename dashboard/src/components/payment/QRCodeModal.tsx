import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface QRCodeModalProps {
  qrCode: string;
  orderId: string | null;
  paymentMethod: 'wechat_pay' | 'alipay';
  onClose: () => void;
  onComplete: () => void;
}

export default function QRCodeModal({ qrCode, orderId, paymentMethod, onClose, onComplete }: QRCodeModalProps) {
  const [polling, setPolling] = useState(true);

  // Poll order status every 2 seconds
  useEffect(() => {
    if (!orderId) return;
    const interval = setInterval(async () => {
      try {
        const order = await api.request(`/api/v2/billing/orders/${orderId}`);
        if (order.status === 'paid') {
          setPolling(false);
          clearInterval(interval);
          onComplete();
        }
      } catch { /* keep polling */ }
    }, 2000);

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      setPolling(false);
      clearInterval(interval);
    }, 5 * 60 * 1000);

    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [orderId, onComplete]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <h3 className="text-lg font-bold mb-2">
            {paymentMethod === 'wechat_pay' ? '微信扫码支付' : '支付宝扫码支付'}
          </h3>
          <p className="text-gray-500 text-sm mb-6">
            {polling ? '请使用手机扫描二维码完成支付' : '支付结果确认中...'}
          </p>

          {/* QR Code display — in production, render actual QR image or use a QR library */}
          <div className="bg-gray-100 w-48 h-48 mx-auto mb-4 flex items-center justify-center rounded-lg">
            {qrCode ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrCode)}`}
                alt="Payment QR Code"
                className="w-44 h-44"
              />
            ) : (
              <span className="text-gray-400">QR Code</span>
            )}
          </div>

          {polling && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              等待支付...
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-2 text-gray-500 hover:text-gray-700 text-sm"
        >
          取消支付
        </button>
      </div>
    </div>
  );
}

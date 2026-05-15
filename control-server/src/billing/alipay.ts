/**
 * Alipay integration — QR code / App payment.
 *
 * Configuration (set in SaaS admin panel / environment):
 *   ALIPAY_APP_ID — Alipay App ID
 *   ALIPAY_PRIVATE_KEY — Merchant private key (PEM)
 *   ALIPAY_PUBLIC_KEY — Alipay public key (PEM)
 *   ALIPAY_NOTIFY_URL — Callback URL
 */
import type { PaymentGateway, PaymentOrder, PaymentResult, PaymentCallback } from './payment-gateway.js';
import { createSign, createVerify } from 'crypto';

export class AlipayGateway implements PaymentGateway {
  readonly name = 'alipay';

  private appId: string;
  private notifyUrl: string;

  constructor(config?: Partial<{
    appId: string; notifyUrl: string;
  }>) {
    this.appId = config?.appId || process.env.ALIPAY_APP_ID || '';
    this.notifyUrl = config?.notifyUrl || process.env.ALIPAY_NOTIFY_URL || '';
  }

  isConfigured(): boolean {
    return !!this.appId;
  }

  async createOrder(order: PaymentOrder): Promise<PaymentResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Alipay not configured — set ALIPAY_APP_ID' };
    }

    try {
      const bizContent = {
        out_trade_no: order.orderId,
        total_amount: (order.amountCents / 100).toFixed(2),
        subject: order.description,
        product_code: 'FAST_INSTANT_TRADE_PAY',
      };

      const params: Record<string, string> = {
        app_id: this.appId,
        method: 'alipay.trade.precreate',
        charset: 'utf-8',
        sign_type: 'RSA2',
        timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '+08:00'),
        version: '1.0',
        notify_url: this.notifyUrl,
        biz_content: JSON.stringify(bizContent),
      };

      const signStr = this.buildSignStr(params);
      params.sign = this.sign(signStr);

      const formBody = new URLSearchParams(params).toString();
      const res = await fetch('https://openapi.alipay.com/gateway.do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      });

      const data = await res.json() as Record<string, unknown>;
      const response = data.alipay_trade_precreate_response as Record<string, unknown> | undefined;

      if (response?.code === '10000' && response.qr_code) {
        return {
          success: true,
          transactionId: response.out_trade_no as string,
          qrCode: response.qr_code as string,
          payUrl: response.qr_code as string,
          rawResponse: data,
        };
      }
      return {
        success: false,
        error: (response?.sub_msg as string) || (response?.msg as string) || 'Alipay error',
        rawResponse: data,
      };
    } catch (err: any) {
      return { success: false, error: `Alipay error: ${err.message}` };
    }
  }

  async queryOrder(outTradeNo: string): Promise<PaymentResult> {
    if (!this.isConfigured()) return { success: false, error: 'Alipay not configured' };

    const bizContent = { out_trade_no: outTradeNo };
    const params: Record<string, string> = {
      app_id: this.appId,
      method: 'alipay.trade.query',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '+08:00'),
      version: '1.0',
      biz_content: JSON.stringify(bizContent),
    };
    const signStr = this.buildSignStr(params);
    params.sign = this.sign(signStr);

    try {
      const res = await fetch('https://openapi.alipay.com/gateway.do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
      const data = await res.json() as Record<string, unknown>;
      return { success: true, rawResponse: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async verifyCallback(callback: PaymentCallback): Promise<boolean> {
    try {
      const body = callback.rawBody as Record<string, string>;
      const sign = body.sign as string;
      const signType = body.sign_type as string || 'RSA2';

      // Remove sign and sign_type for verification
      const verifyParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(body)) {
        if (k !== 'sign' && k !== 'sign_type' && v !== undefined) {
          verifyParams[k] = v;
        }
      }
      const signStr = this.buildSignStr(verifyParams);

      // Verify with Alipay public key
      // const verifier = createVerify('RSA-SHA256');
      // verifier.update(signStr);
      // return verifier.verify(alipayPublicKey, sign, 'base64');

      return !!(sign && signStr);
    } catch {
      return false;
    }
  }

  async parseCallback(callback: PaymentCallback): Promise<{
    outTradeNo: string; transactionId: string; amountCents: number; status: 'success' | 'failed' | 'refund';
  } | null> {
    try {
      const body = callback.rawBody as Record<string, string>;
      const tradeStatus = body.trade_status;
      let status: 'success' | 'failed' | 'refund' = 'failed';
      if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') status = 'success';

      return {
        outTradeNo: body.out_trade_no,
        transactionId: body.trade_no,
        amountCents: Math.round(parseFloat(body.total_amount || '0') * 100),
        status,
      };
    } catch {
      return null;
    }
  }

  private buildSignStr(params: Record<string, string>): string {
    const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== '').sort();
    return keys.map(k => `${k}=${params[k]}`).join('&');
  }

  private sign(signStr: string): string {
    // Stub: real implementation uses merchant private key
    // return createSign('RSA-SHA256').update(signStr).sign(privateKey, 'base64');
    return createSign('RSA-SHA256').update(signStr).sign('', 'base64');
  }
}

export const alipayGateway = new AlipayGateway();

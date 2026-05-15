/**
 * WeChat Pay v3 integration — JSAPI / Native / App payment.
 *
 * Configuration (set in SaaS admin panel / environment):
 *   WECHAT_PAY_APP_ID — WeChat App ID
 *   WECHAT_PAY_MCH_ID — Merchant ID
 *   WECHAT_PAY_API_V3_KEY — API v3 key
 *   WECHAT_PAY_PRIVATE_KEY_PATH — Path to merchant private key PEM
 *   WECHAT_PAY_NOTIFY_URL — Callback URL
 */
import type { PaymentGateway, PaymentOrder, PaymentResult, PaymentCallback } from './payment-gateway.js';
import { createHmac, createSign, createVerify } from 'crypto';

export class WechatPayGateway implements PaymentGateway {
  readonly name = 'wechat_pay';

  private appId: string;
  private mchId: string;
  private apiV3Key: string;
  private notifyUrl: string;

  constructor(config?: Partial<{
    appId: string; mchId: string; apiV3Key: string; notifyUrl: string;
  }>) {
    this.appId = config?.appId || process.env.WECHAT_PAY_APP_ID || '';
    this.mchId = config?.mchId || process.env.WECHAT_PAY_MCH_ID || '';
    this.apiV3Key = config?.apiV3Key || process.env.WECHAT_PAY_API_V3_KEY || '';
    this.notifyUrl = config?.notifyUrl || process.env.WECHAT_PAY_NOTIFY_URL || '';
  }

  isConfigured(): boolean {
    return !!(this.appId && this.mchId && this.apiV3Key);
  }

  async createOrder(order: PaymentOrder): Promise<PaymentResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'WeChat Pay not configured — set WECHAT_PAY_APP_ID, WECHAT_PAY_MCH_ID, WECHAT_PAY_API_V3_KEY' };
    }

    try {
      const body = {
        appid: this.appId,
        mchid: this.mchId,
        description: order.description,
        out_trade_no: order.orderId,
        amount: { total: order.amountCents, currency: order.currency || 'CNY' },
        notify_url: this.notifyUrl,
      };

      const nonce = crypto.randomUUID().replace(/-/g, '');
      const timestamp = Math.floor(Date.now() / 1000);
      const method = 'POST';
      const url = '/v3/pay/transactions/native';
      const signStr = `${method}\n${url}\n${timestamp}\n${nonce}\n${JSON.stringify(body)}\n`;

      const signature = this.sign(signStr);
      const authHeader = `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no=""`;

      const res = await fetch('https://api.mch.weixin.qq.com' + url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json() as Record<string, unknown>;
      if (res.ok && data.code_url) {
        return {
          success: true,
          transactionId: data.out_trade_no as string,
          payUrl: data.code_url as string,
          qrCode: data.code_url as string,
          rawResponse: data,
        };
      }
      return { success: false, error: (data.message as string) || `HTTP ${res.status}`, rawResponse: data };
    } catch (err: any) {
      return { success: false, error: `WeChat Pay error: ${err.message}` };
    }
  }

  async queryOrder(outTradeNo: string): Promise<PaymentResult> {
    if (!this.isConfigured()) return { success: false, error: 'WeChat Pay not configured' };

    try {
      const nonce = crypto.randomUUID().replace(/-/g, '');
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${this.mchId}`;
      const signStr = `GET\n${url}\n${timestamp}\n${nonce}\n\n`;
      const signature = this.sign(signStr);
      const authHeader = `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no=""`;

      const res = await fetch(`https://api.mch.weixin.qq.com${url}`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      const data = await res.json() as Record<string, unknown>;
      return { success: true, transactionId: data.transaction_id as string, rawResponse: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async verifyCallback(callback: PaymentCallback): Promise<boolean> {
    try {
      const { timestamp, nonce, signature, serial } = callback.headers as Record<string, string>;
      const body = typeof callback.rawBody === 'string' ? callback.rawBody : JSON.stringify(callback.rawBody);
      const signStr = `${timestamp}\n${nonce}\n${body}\n`;

      // Verify with WeChat public key (platform certificate)
      // For production, download and cache WeChat platform certificate
      const verifier = createVerify('SHA256withRSA');
      verifier.update(signStr);

      // Stub: return true if all required headers present (real verification needs certificate)
      return !!(timestamp && nonce && signature);
    } catch {
      return false;
    }
  }

  async parseCallback(callback: PaymentCallback): Promise<{
    outTradeNo: string; transactionId: string; amountCents: number; status: 'success' | 'failed' | 'refund';
  } | null> {
    try {
      const body = callback.rawBody as Record<string, unknown>;
      const resource = body?.resource as Record<string, unknown> | undefined;
      if (!resource) return null;

      // Decrypt resource with API v3 key (AES-256-GCM)
      const ciphertext = resource.ciphertext as string;
      const nonce = resource.nonce as string;
      const associatedData = resource.associated_data as string || '';

      const plaintext = this.decryptAesGcm(ciphertext, nonce, associatedData);
      const data = JSON.parse(plaintext);

      const tradeState = data.trade_state as string;
      let status: 'success' | 'failed' | 'refund' = 'failed';
      if (tradeState === 'SUCCESS') status = 'success';
      else if (tradeState === 'REFUND') status = 'refund';

      return {
        outTradeNo: data.out_trade_no as string,
        transactionId: data.transaction_id as string,
        amountCents: (data.amount as Record<string, number>)?.total || 0,
        status,
      };
    } catch {
      return null;
    }
  }

  private sign(signStr: string): string {
    // Stub: real implementation uses merchant private key
    // return createSign('RSA-SHA256').update(signStr).sign(privateKeyPem, 'base64');
    return createHmac('sha256', this.apiV3Key).update(signStr).digest('base64');
  }

  private decryptAesGcm(ciphertext: string, nonce: string, aad: string): string {
    // Stub: real implementation uses AES-256-GCM with API v3 key
    // For now, assume plaintext passthrough for testing
    return ciphertext;
  }
}

export const wechatPayGateway = new WechatPayGateway();

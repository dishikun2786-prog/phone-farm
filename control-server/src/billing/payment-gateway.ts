/**
 * Payment gateway abstraction — supports WeChat Pay, Alipay, and future providers.
 * Configuration values are left empty for super admin to configure in SaaS admin panel.
 */
export interface PaymentOrder {
  orderId: string;
  amountCents: number;
  currency: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  payUrl?: string;
  qrCode?: string;
  error?: string;
  rawResponse?: Record<string, unknown>;
}

export interface PaymentCallback {
  gateway: string;
  rawBody: unknown;
  headers: Record<string, string>;
}

export interface PaymentGateway {
  readonly name: string;
  /** Create a payment order and return payment URL/QR code */
  createOrder(order: PaymentOrder): Promise<PaymentResult>;
  /** Query order status from the payment provider */
  queryOrder(outTradeNo: string): Promise<PaymentResult>;
  /** Verify webhook callback signature */
  verifyCallback(callback: PaymentCallback): Promise<boolean>;
  /** Parse callback body into standardized format */
  parseCallback(callback: PaymentCallback): Promise<{
    outTradeNo: string;
    transactionId: string;
    amountCents: number;
    status: 'success' | 'failed' | 'refund';
  } | null>;
}

/** Registry of all payment gateways */
const gateways = new Map<string, PaymentGateway>();

export function registerGateway(gateway: PaymentGateway): void {
  gateways.set(gateway.name, gateway);
}

export function getGateway(name: string): PaymentGateway | undefined {
  return gateways.get(name);
}

export function listGateways(): string[] {
  return [...gateways.keys()];
}

import { Injectable } from '@nestjs/common';

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
}

export type VaultKind = 'paypal' | 'card';

/** A method PayPal stored for us. We keep the token and display details only. */
export interface VaultedMethod {
  token: string;
  customerId: string | null;
  kind: VaultKind;
  email: string | null;
  brand: string | null;
  last4: string | null;
  expiry: string | null;
}

export interface OrderResult {
  id: string;
  status: string;
  /** Where to send the shopper to approve; null when the order needs no approval (saved method). */
  approveUrl: string | null;
  capture: CaptureResult | null;
  raw: Record<string, unknown>;
}

export interface CaptureResult {
  /** COMPLETED | PENDING | DECLINED | FAILED … (null when the order has no capture yet). */
  status: string | null;
  completed: boolean;
  amount: number;
  currency: string | null;
  captureId: string | null;
  vault: VaultedMethod | null;
  raw: Record<string, unknown>;
}

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly issue: string | null,
    message: string,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * PayPal REST (Orders v2 + Vault v3). Card details never touch our servers: the
 * shopper enters them on PayPal's checkout page or in PayPal's hosted card fields,
 * and PayPal hands back a vault token. Credits are only granted after a
 * server-side capture we initiated ourselves.
 */
@Injectable()
export class PayPalClient {
  private token: { key: string; value: string; expiresAt: number } | null = null;

  config(): PayPalConfig | null {
    const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, sandbox: process.env.PAYPAL_MODE?.trim() !== 'live' };
  }

  private baseUrl(cfg: PayPalConfig): string {
    return cfg.sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  }

  private async accessToken(cfg: PayPalConfig): Promise<string> {
    const key = `${cfg.clientId}:${cfg.sandbox}`;
    if (this.token && this.token.key === key && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const response = await fetch(`${this.baseUrl(cfg)}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    });
    const body = obj(await response.json().catch(() => null));
    const value = str(body.access_token);
    if (!response.ok || !value) throw new PayPalApiError(response.status, str(body.error), 'PayPal authentication failed — check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
    this.token = { key, value, expiresAt: Date.now() + Number(body.expires_in ?? 3000) * 1000 };
    return value;
  }

  private async call(cfg: PayPalConfig, method: 'GET' | 'POST' | 'DELETE', path: string, body?: Json, requestId?: string): Promise<Json> {
    const response = await fetch(`${this.baseUrl(cfg)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken(cfg)}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 204) return {};
    const json = obj(await response.json().catch(() => null));
    if (!response.ok) {
      const issue = str(obj((json.details as unknown[] | undefined)?.[0]).issue) ?? str(json.name);
      throw new PayPalApiError(response.status, issue, `PayPal ${method} ${path.split('?')[0]} failed (${response.status}${issue ? ` ${issue}` : ''})`);
    }
    return json;
  }

  private link(json: Json, ...rels: string[]): string | null {
    const links = (json.links as { rel?: string; href?: string }[] | undefined) ?? [];
    return links.find((l) => l.rel && rels.includes(l.rel))?.href ?? null;
  }

  /** Vault details from an order/capture or payment-token response's payment_source. */
  private vaultFrom(source: Json, customerFallback?: Json): VaultedMethod | null {
    const paypal = obj(source.paypal);
    const card = obj(source.card);
    const kind: VaultKind | null = Object.keys(card).length ? 'card' : Object.keys(paypal).length ? 'paypal' : null;
    if (!kind) return null;
    const node = kind === 'card' ? card : paypal;
    const vault = obj(obj(node.attributes).vault);
    const token = str(vault.id);
    if (!token) return null;
    return {
      token,
      customerId: str(obj(vault.customer).id) ?? str(obj(customerFallback).id),
      kind,
      email: kind === 'paypal' ? str(node.email_address) : null,
      brand: kind === 'card' ? str(node.brand) : null,
      last4: kind === 'card' ? str(node.last_digits) : null,
      expiry: kind === 'card' ? str(node.expiry) : null,
    };
  }

  private captureFrom(json: Json): CaptureResult {
    const unit = obj((json.purchase_units as unknown[] | undefined)?.[0]);
    const capture = obj((obj(unit.payments).captures as unknown[] | undefined)?.[0]);
    const amount = obj(capture.amount);
    return {
      status: str(capture.status),
      completed: str(capture.status) === 'COMPLETED',
      amount: Number(amount.value ?? 0),
      currency: str(amount.currency_code),
      captureId: str(capture.id),
      vault: this.vaultFrom(obj(json.payment_source)),
      raw: json,
    };
  }

  async createOrder(
    cfg: PayPalConfig,
    input: {
      reference: string;
      amount: string;
      description: string;
      returnUrl: string;
      cancelUrl: string;
      /** Save the PayPal account used for this checkout. */
      vault: boolean;
      customerId: string | null;
      /** Pay with an already saved method — no shopper approval needed. */
      saved?: { kind: VaultKind; token: string } | null;
    },
  ): Promise<OrderResult> {
    const paymentSource = input.saved
      ? { [input.saved.kind]: { vault_id: input.saved.token } }
      : {
          paypal: {
            experience_context: {
              brand_name: 'FoxIndex',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
            ...(input.vault
              ? { attributes: { vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT', customer_type: 'CONSUMER' }, ...(input.customerId ? { customer: { id: input.customerId } } : {}) } }
              : {}),
          },
        };
    const json = await this.call(
      cfg,
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.reference,
            invoice_id: input.reference,
            custom_id: input.reference,
            description: input.description.slice(0, 127),
            amount: { currency_code: 'USD', value: input.amount },
          },
        ],
        payment_source: paymentSource,
      },
      `order-${input.reference}`,
    );
    const status = str(json.status) ?? 'UNKNOWN';
    return {
      id: str(json.id) ?? '',
      status,
      approveUrl: this.link(json, 'payer-action', 'approve'),
      capture: status === 'COMPLETED' ? this.captureFrom(json) : null,
      raw: json,
    };
  }

  /** Idempotent per order: a repeat capture returns the original result (or ORDER_ALREADY_CAPTURED). */
  async captureOrder(cfg: PayPalConfig, orderId: string): Promise<CaptureResult> {
    try {
      return this.captureFrom(await this.call(cfg, 'POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `capture-${orderId}`));
    } catch (error) {
      if (error instanceof PayPalApiError && error.issue === 'ORDER_ALREADY_CAPTURED') return this.captureFrom(await this.getOrder(cfg, orderId));
      throw error;
    }
  }

  getOrder(cfg: PayPalConfig, orderId: string): Promise<Json> {
    return this.call(cfg, 'GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  orderCapture(json: Json): CaptureResult {
    return this.captureFrom(json);
  }

  /** Start saving a method without a purchase. PayPal accounts need an approval redirect; cards use PayPal's hosted card fields. */
  async createSetupToken(
    cfg: PayPalConfig,
    input: { kind: VaultKind; customerId: string | null; returnUrl: string; cancelUrl: string },
  ): Promise<{ id: string; approveUrl: string | null }> {
    const experience = { brand_name: 'FoxIndex', shipping_preference: 'NO_SHIPPING', return_url: input.returnUrl, cancel_url: input.cancelUrl };
    const json = await this.call(cfg, 'POST', '/v3/vault/setup-tokens', {
      ...(input.customerId ? { customer: { id: input.customerId } } : {}),
      payment_source:
        input.kind === 'paypal'
          ? { paypal: { usage_type: 'MERCHANT', customer_type: 'CONSUMER', permit_multiple_payment_tokens: true, experience_context: experience } }
          : { card: { verification_method: 'SCA_WHEN_REQUIRED', experience_context: experience } },
    });
    const id = str(json.id);
    if (!id) throw new PayPalApiError(502, null, 'PayPal did not return a setup token');
    return { id, approveUrl: this.link(json, 'approve', 'payer-action') };
  }

  /** Turn an approved setup token into a permanent payment token. */
  async createPaymentToken(cfg: PayPalConfig, setupTokenId: string): Promise<VaultedMethod> {
    const json = await this.call(cfg, 'POST', '/v3/vault/payment-tokens', { payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } }, `ptoken-${setupTokenId}`);
    const source = obj(json.payment_source);
    const paypal = obj(source.paypal);
    const card = obj(source.card);
    const kind: VaultKind = Object.keys(card).length ? 'card' : 'paypal';
    const token = str(json.id);
    if (!token) throw new PayPalApiError(502, null, 'PayPal did not return a payment token');
    return {
      token,
      customerId: str(obj(json.customer).id),
      kind,
      email: kind === 'paypal' ? str(paypal.email_address) : null,
      brand: kind === 'card' ? str(card.brand) : null,
      last4: kind === 'card' ? str(card.last_digits) : null,
      expiry: kind === 'card' ? str(card.expiry) : null,
    };
  }

  async deletePaymentToken(cfg: PayPalConfig, token: string): Promise<void> {
    await this.call(cfg, 'DELETE', `/v3/vault/payment-tokens/${encodeURIComponent(token)}`);
  }
}

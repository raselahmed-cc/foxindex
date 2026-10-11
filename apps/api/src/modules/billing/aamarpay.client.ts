import { Injectable } from '@nestjs/common';

export interface AamarPayConfig {
  storeId: string;
  signatureKey: string;
  sandbox: boolean;
}

export interface InitiateInput {
  tranId: string;
  amount: string;
  currency: 'BDT' | 'USD';
  description: string;
  customer: { name: string; email: string; phone: string };
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
}

export interface VerifyResult {
  paid: boolean;
  amount: number;
  currency: string | null;
  gatewayTxnId: string | null;
  raw: Record<string, unknown>;
}

/**
 * aamarPay JSON API (jsonpost.php to start a checkout, trxcheck to verify).
 * Credits are only granted after a server-to-server trxcheck — the browser
 * redirect back to us is never trusted on its own.
 */
@Injectable()
export class AamarPayClient {
  config(): AamarPayConfig | null {
    const storeId = process.env.AAMARPAY_STORE_ID?.trim();
    const signatureKey = process.env.AAMARPAY_SIGNATURE_KEY?.trim();
    if (!storeId || !signatureKey) return null;
    return { storeId, signatureKey, sandbox: process.env.AAMARPAY_SANDBOX !== 'false' };
  }

  private baseUrl(cfg: AamarPayConfig): string {
    return cfg.sandbox ? 'https://sandbox.aamarpay.com' : 'https://secure.aamarpay.com';
  }

  async initiate(cfg: AamarPayConfig, input: InitiateInput): Promise<string> {
    const response = await fetch(`${this.baseUrl(cfg)}/jsonpost.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        store_id: cfg.storeId,
        signature_key: cfg.signatureKey,
        tran_id: input.tranId,
        amount: input.amount,
        currency: input.currency,
        desc: input.description,
        cus_name: input.customer.name,
        cus_email: input.customer.email,
        cus_phone: input.customer.phone,
        success_url: input.successUrl,
        fail_url: input.failUrl,
        cancel_url: input.cancelUrl,
        type: 'json',
      }),
    });
    const body = (await response.json().catch(() => null)) as { result?: string; payment_url?: string } | null;
    if (!response.ok || !body?.payment_url) {
      throw new Error(`aamarPay initiate failed (${response.status})`);
    }
    return body.payment_url;
  }

  async verify(cfg: AamarPayConfig, tranId: string): Promise<VerifyResult> {
    const url = new URL(`${this.baseUrl(cfg)}/api/v1/trxcheck/request.php`);
    url.searchParams.set('request_id', tranId);
    url.searchParams.set('store_id', cfg.storeId);
    url.searchParams.set('signature_key', cfg.signatureKey);
    url.searchParams.set('type', 'json');

    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const raw = ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    return {
      paid: raw.pay_status === 'Successful',
      amount: Number(raw.amount ?? raw.amount_original ?? 0),
      currency: typeof raw.currency === 'string' ? raw.currency : null,
      gatewayTxnId: typeof raw.pg_txnid === 'string' ? raw.pg_txnid : null,
      raw,
    };
  }
}

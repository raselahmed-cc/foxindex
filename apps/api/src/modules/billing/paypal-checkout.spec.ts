import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import { PaymentAccountsService } from './payment-accounts.service';
import { PayPalApiError, type CaptureResult, type PayPalClient, type VaultedMethod } from './paypal.client';

const vault: VaultedMethod = { token: 'tok_1', customerId: 'cus_1', kind: 'card', email: null, brand: 'VISA', last4: '4242', expiry: '2030-01' };

function capture(over: Partial<CaptureResult> = {}): CaptureResult {
  return { status: 'COMPLETED', completed: true, amount: 36, currency: 'USD', captureId: 'CAP1', vault: null, raw: {}, ...over };
}

function setup(opts: { status?: string; saveMethod?: boolean; capture?: CaptureResult | Error }) {
  const payment = { id: 'p1', reference: 'PAY-2001', userId: 'u1', status: opts.status ?? 'pending', amount: '36.00', currency: 'USD', gatewayOrderId: 'ORDER1', saveMethod: opts.saveMethod ?? false, expiresAt: new Date(Date.now() + 3600_000) };
  const updates: Record<string, unknown>[] = [];
  const db = {
    query: { payments: { findFirst: vi.fn().mockResolvedValue(payment) } },
    update: vi.fn(() => ({ set: (values: Record<string, unknown>) => ({ where: () => Object.assign(Promise.resolve(updates.push(values)), { catch: () => Promise.resolve() }) }) })),
  };
  const paypal = {
    config: () => ({ clientId: 'c', clientSecret: 's', sandbox: true }),
    captureOrder: opts.capture instanceof Error ? vi.fn().mockRejectedValue(opts.capture) : vi.fn().mockResolvedValue(opts.capture ?? capture()),
  };
  const accounts = { saveVaulted: vi.fn().mockResolvedValue({}) };
  const service = new BillingService(db as never, {} as never, {} as never, {} as never, {} as never, {} as never, paypal as unknown as PayPalClient, accounts as unknown as PaymentAccountsService);
  const approve = vi.spyOn(service as unknown as { approveInternal: () => Promise<unknown> }, 'approveInternal').mockResolvedValue(null);
  return { service, approve, updates, accounts, paypal };
}

describe('BillingService.handlePayPalReturn', () => {
  it('credits a completed capture for the full USD amount', async () => {
    const { service, approve, updates } = setup({});
    await expect(service.handlePayPalReturn('PAY-2001', 'success')).resolves.toBe('approved');
    expect(approve).toHaveBeenCalledOnce();
    expect(updates[0]).toMatchObject({ transactionId: 'CAP1' });
  });

  it('saves the vaulted method only when the shopper asked to', async () => {
    const asked = setup({ saveMethod: true, capture: capture({ vault }) });
    await asked.service.handlePayPalReturn('PAY-2001', 'success');
    expect(asked.accounts.saveVaulted).toHaveBeenCalledWith('u1', vault);

    const notAsked = setup({ saveMethod: false, capture: capture({ vault }) });
    await notAsked.service.handlePayPalReturn('PAY-2001', 'success');
    expect(notAsked.accounts.saveVaulted).not.toHaveBeenCalled();
  });

  it('holds an underpaid or non-USD capture for review instead of crediting', async () => {
    for (const c of [capture({ amount: 10 }), capture({ currency: 'EUR' })]) {
      const { service, approve, updates } = setup({ capture: c });
      await expect(service.handlePayPalReturn('PAY-2001', 'success')).resolves.toBe('pending');
      expect(approve).not.toHaveBeenCalled();
      expect(updates.at(-1)).toMatchObject({ status: 'under_review' });
    }
  });

  it('rejects a cancelled checkout without calling PayPal', async () => {
    const { service, paypal, updates } = setup({});
    await expect(service.handlePayPalReturn('PAY-2001', 'cancel')).resolves.toBe('failed');
    expect(paypal.captureOrder).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: 'rejected' });
  });

  it('rejects a declined card', async () => {
    const { service, approve, updates } = setup({ capture: new PayPalApiError(422, 'INSTRUMENT_DECLINED', 'declined') });
    await expect(service.handlePayPalReturn('PAY-2001', 'success')).resolves.toBe('failed');
    expect(approve).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: 'rejected' });
  });

  it('leaves the payment pending when PayPal is unreachable', async () => {
    const { service, approve, updates } = setup({ capture: new Error('timeout') });
    await expect(service.handlePayPalReturn('PAY-2001', 'success')).resolves.toBe('pending');
    expect(approve).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('never re-processes a payment that is already settled', async () => {
    const { service, paypal } = setup({ status: 'rejected' });
    await expect(service.handlePayPalReturn('PAY-2001', 'success')).resolves.toBe('failed');
    expect(paypal.captureOrder).not.toHaveBeenCalled();
  });
});

describe('PaymentAccountsService.confirmVault', () => {
  it('only lets the client who started a PayPal setup finish it', async () => {
    const paypal = { config: () => ({ clientId: 'c', clientSecret: 's', sandbox: true }), createPaymentToken: vi.fn().mockResolvedValue(vault) };
    const redis = { get: vi.fn().mockResolvedValue('someone-else'), del: vi.fn() };
    const service = new PaymentAccountsService({} as never, paypal as unknown as PayPalClient, redis as never, {} as never);
    await expect(service.confirmVault('u1', 'SETUP-1')).rejects.toThrow();
    expect(paypal.createPaymentToken).not.toHaveBeenCalled();
  });
});

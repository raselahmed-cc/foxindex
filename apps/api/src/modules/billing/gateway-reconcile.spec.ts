import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import type { AamarPayClient, VerifyResult } from './aamarpay.client';

const HOUR = 60 * 60 * 1000;

function setup(opts: { status?: string; expiresInMs?: number; verify?: Partial<VerifyResult> | Error }) {
  const payment = {
    id: 'p1',
    reference: 'PAY-1001',
    status: opts.status ?? 'pending',
    amount: '500.00',
    currency: 'BDT',
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? HOUR)),
  };
  const updates: Record<string, unknown>[] = [];
  const db = {
    query: { payments: { findFirst: vi.fn().mockResolvedValue(payment) } },
    update: vi.fn(() => ({ set: (values: Record<string, unknown>) => ({ where: () => (updates.push(values), Promise.resolve()) }) })),
  };
  const aamarpay = {
    config: () => ({ storeId: 's', signatureKey: 'k', sandbox: true }),
    verify:
      opts.verify instanceof Error
        ? vi.fn().mockRejectedValue(opts.verify)
        : vi.fn().mockResolvedValue({ paid: false, amount: 0, currency: 'BDT', gatewayTxnId: null, raw: {}, ...opts.verify }),
  };
  const service = new BillingService(db as never, {} as never, {} as never, {} as never, {} as never, aamarpay as unknown as AamarPayClient, {} as never, {} as never);
  const approve = vi.spyOn(service as unknown as { approveInternal: () => Promise<unknown> }, 'approveInternal').mockResolvedValue(null);
  return { service, approve, updates };
}

describe('BillingService.reconcileGatewayPayment', () => {
  it('credits a checkout the gateway confirms as paid in full', async () => {
    const { service, approve } = setup({ verify: { paid: true, amount: 500, gatewayTxnId: 'T1' } });
    await expect(service.reconcileGatewayPayment('PAY-1001')).resolves.toBe('approved');
    expect(approve).toHaveBeenCalledOnce();
  });

  it('sends an underpaid checkout to staff review instead of crediting it', async () => {
    const { service, approve, updates } = setup({ verify: { paid: true, amount: 100 } });
    await expect(service.reconcileGatewayPayment('PAY-1001')).resolves.toBe('review');
    expect(approve).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: 'under_review' });
  });

  it('keeps waiting while an unpaid checkout is still open', async () => {
    const { service, updates } = setup({});
    await expect(service.reconcileGatewayPayment('PAY-1001')).resolves.toBe('pending');
    expect(updates).toHaveLength(0);
  });

  it('expires an unpaid checkout after its window closes', async () => {
    const { service, updates } = setup({ expiresInMs: -HOUR });
    await expect(service.reconcileGatewayPayment('PAY-1001')).resolves.toBe('expired');
    expect(updates[0]).toMatchObject({ status: 'expired' });
  });

  it('does not expire anything when the gateway cannot be reached', async () => {
    const { service, updates } = setup({ expiresInMs: -HOUR, verify: new Error('timeout') });
    await expect(service.reconcileGatewayPayment('PAY-1001')).resolves.toBe('pending');
    expect(updates).toHaveLength(0);
  });

  it('leaves payments that are no longer pending alone', async () => {
    const { service, approve } = setup({ status: 'approved', verify: { paid: true, amount: 500 } });
    await expect(service.reconcileGatewayPayment('PAY-1001')).resolves.toBe('pending');
    expect(approve).not.toHaveBeenCalled();
  });
});

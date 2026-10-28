import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type IORedis from 'ioredis';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { AamarPayClient } from './aamarpay.client';
import { PayPalClient } from './paypal.client';
import { BillingService } from './billing.service';

const EVERY_MS = 3 * 60 * 1000;
const LOCK_KEY = 'lock:gateway-reconcile';

/**
 * Credits gateway payments whose shopper never returned to the site. Runs every
 * few minutes; a Redis lock keeps it to one API replica at a time.
 */
@Injectable()
export class GatewayReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GatewayReconcilerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(AamarPayClient) private readonly aamarpay: AamarPayClient,
    @Inject(PayPalClient) private readonly paypal: PayPalClient,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    if (!this.aamarpay.config() && !this.paypal.config()) return;
    const locked = await this.redis.set(LOCK_KEY, '1', 'PX', EVERY_MS - 10_000, 'NX').catch(() => null);
    if (locked !== 'OK') return;
    try {
      const refs = await this.billing.pendingGatewayReferences();
      const tally: Record<string, number> = {};
      for (const ref of refs) {
        const outcome = await this.billing.reconcileGatewayPayment(ref);
        tally[outcome] = (tally[outcome] ?? 0) + 1;
      }
      if (tally.approved || tally.expired || tally.review) this.logger.log(`gateway reconcile: ${JSON.stringify(tally)}`);
    } catch (error) {
      this.logger.error(`gateway reconcile failed: ${(error as Error).message}`);
    }
  }
}

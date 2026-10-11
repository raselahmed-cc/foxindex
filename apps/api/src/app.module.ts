import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { loadApiEnv } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/envelope/response-envelope.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { LoggerModule } from './logger/logger.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { CreditsModule } from './modules/credits/credits.module';
import { AdminModule } from './modules/admin/admin.module';
import { ChatModule } from './modules/chat/chat.module';
import { BillingModule } from './modules/billing/billing.module';
import { PlatformModule } from './modules/platform/platform.module';
import { BatchesModule } from './modules/batches/batches.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { RealtimeModule } from './common/realtime/realtime.service';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { QueuesModule } from './queues/queues.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: () => loadApiEnv() }),
    LoggerModule,
    DatabaseModule,
    RedisModule,
    QueuesModule,
    IdempotencyModule,
    AuditLogsModule,
    RealtimeModule,
    FilesModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    ApiKeysModule,
    CreditsModule,
    AdminModule,
    ChatModule,
    BillingModule,
    PlatformModule,
    BatchesModule,
    TrackingModule,
    TicketsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

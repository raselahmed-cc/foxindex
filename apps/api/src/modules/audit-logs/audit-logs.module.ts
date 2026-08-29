import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

/**
 * Global so any module can inject AuditLogService without listing this module
 * as an explicit import — it has no controller, so there's no route surface to
 * accidentally expose by making it global.
 */
@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogsModule {}

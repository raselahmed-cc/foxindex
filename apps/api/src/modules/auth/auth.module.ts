import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';
import { AuthAccountController, MeController } from './me.controller';
import { mailerProvider } from './mailer.provider';

/** AuditLogService comes from the @Global() AuditLogsModule already imported in AppModule — no need to import it again here. */
@Module({
  imports: [CreditsModule],
  controllers: [AuthController, AuthAccountController, MeController],
  providers: [AuthService, AccountService, mailerProvider],
  exports: [AuthService],
})
export class AuthModule {}

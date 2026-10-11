import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

const readSchema = z.object({ ids: z.array(z.uuid()).max(200).optional() });

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user'], @Query('limit') limit?: string) {
    return this.notifications.list(user.id, Math.min(100, Math.max(1, Number(limit) || 30)));
  }

  @Post('read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthenticatedRequest['user'], @Body(new ZodValidationPipe(readSchema)) body: z.infer<typeof readSchema>) {
    return this.notifications.markRead(user.id, body.ids);
  }
}

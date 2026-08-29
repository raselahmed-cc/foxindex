import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('me')
export class MeController {
  @Get()
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: SessionUser): { user: SessionUser } {
    return { user };
  }
}

import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  approveUserSchema,
  assignManagerSchema,
  createClientSchema,
  grantCreditsSchema,
  setUserStatusSchema,
  userListQuerySchema,
  type ApproveUserInput,
  type AssignManagerInput,
  type CreateClientInput,
  type GrantCreditsInput,
  type SetUserStatusInput,
  type UserListQuery,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OwnsClientGuard } from '../../common/guards/owns-client.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';

/**
 * Global-role-gated (docs/adr/0014's Roles table) — no ProjectOwnershipGuard
 * anywhere here. List routes (`users`, `managers`) filter by actor inside
 * AdminRepository itself; single-target routes (`:userId/...`) additionally
 * carry OwnsClientGuard so a manager can only act on their own clients —
 * admin/superadmin bypass it (see OwnsClientGuard).
 */
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('users')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
  findUsers(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Query(new ZodValidationPipe(userListQuerySchema)) query: UserListQuery,
  ) {
    return this.admin.findUsersForActor(actor, query);
  }

  @Post('users')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  createClient(@CurrentUser() actor: AuthenticatedRequest['user'], @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput) {
    return this.admin.createClient(actor.id, body);
  }

  @Patch('users/:userId/status')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  setStatus(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(setUserStatusSchema)) body: SetUserStatusInput,
  ) {
    return this.admin.setStatus(userId, actor, body);
  }

  @Get('managers')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  findManagers() {
    return this.admin.findManagers();
  }

  @Patch('users/:userId/assign-manager')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  assignManager(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(assignManagerSchema)) body: AssignManagerInput,
  ) {
    return this.admin.assignManager(userId, actor.id, body);
  }

  @Post('users/:userId/approve')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
  @UseGuards(OwnsClientGuard)
  approve(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(approveUserSchema)) body: ApproveUserInput,
  ) {
    return this.admin.approve(userId, actor.id, body);
  }

  @Post('users/:userId/credits/grant')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
  @UseGuards(OwnsClientGuard)
  grantCredits(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(grantCreditsSchema)) body: GrantCreditsInput,
  ) {
    return this.admin.grantCredits(userId, actor, body);
  }
}

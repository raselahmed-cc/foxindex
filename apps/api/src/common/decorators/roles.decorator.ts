import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@foxindex/types';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to specific global platform roles (docs/adr/0013) —
 * used only by the admin module now. Regular project/submission/api-key
 * routes are authorized entirely by ProjectOwnershipGuard (do you own this
 * project?), not by a role tier — there's no team/multi-user-per-project
 * concept left to need one.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

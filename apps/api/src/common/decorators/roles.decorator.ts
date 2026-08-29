import { SetMetadata } from '@nestjs/common';
import type { Role } from '@foxindex/types';

export const ROLES_KEY = 'roles';

/** Restricts a route to specific organization roles. No decorator = any member of the resolved organization. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

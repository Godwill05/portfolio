import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  type CustomDecorator,
} from '@nestjs/common';
import type { Permission, UserRole } from '../constants/domain';
import type { AuthenticatedUser } from '../../modules/auth/types';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without an access token. */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_AUTH_KEY = 'optionalAuth';
export const OptionalAuth = (): CustomDecorator => SetMetadata(OPTIONAL_AUTH_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: Permission[]): CustomDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);

export const RequestContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): { ip: string; userAgent: string } => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ ip?: string; headers: Record<string, string> }>();
    return {
      ip: request.ip ?? request.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? '',
      userAgent: request.headers['user-agent'] ?? '',
    };
  },
);

export const IS_AI_QUOTA_KEY = 'aiQuota';
export interface AiQuotaMeta {
  feature: import('../constants/domain').AiFeature;
  cost?: number;
}
export const ConsumesAiQuota = (feature: AiQuotaMeta['feature'], cost = 1): CustomDecorator =>
  SetMetadata(IS_AI_QUOTA_KEY, { feature, cost } satisfies AiQuotaMeta);

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import {
  IS_PUBLIC_KEY,
  OPTIONAL_AUTH_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from '../decorators';
import type { Permission, UserRole } from '../constants/domain';
import type { AuthenticatedUser } from '../../modules/auth/types';

/** Global guard: everything is private unless explicitly marked @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isOptional) {
      // Try to authenticate, but never block anonymous visitors.
      return super.canActivate(context) as Promise<boolean>;
    }
    if (isPublic) return true;
    return super.canActivate(context) as Promise<boolean>;
  }

  override handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isOptional = this.reflector?.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isOptional && !user) return undefined as unknown as TUser;
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException('Authentication required');
    }
    return user;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new UnauthorizedException();
    return roles.includes(user.role);
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new UnauthorizedException();
    return required.every((permission) => user.permissions.includes(permission));
  }
}

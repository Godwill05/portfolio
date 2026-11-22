import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators';
import { SettingsService } from '../../modules/settings/settings.service';

/**
 * Global maintenance switch, editable from the admin dashboard.
 * Runs after JWT authentication (guard order matters), so the admin bypass
 * works on authenticated requests.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const maintenance = this.settings.maintenance;
    if (!maintenance.enabled) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { role?: string } }>();

    if (maintenance.allowAdminAccess) {
      const role = request.user?.role;
      if (role === 'admin' || role === 'super_admin') return true;
    }

    const url = request.originalUrl ?? request.url ?? '';
    // Keep the SPA bootable + auth reachable so users see the maintenance screen.
    const allowedPrefixes = [
      '/api/health',
      '/api/bootstrap',
      '/api/auth',
      '/api/files/public',
      '/api/settings/public',
    ];
    if (allowedPrefixes.some((prefix) => url.startsWith(prefix))) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    throw new ServiceUnavailableException({
      code: 'MAINTENANCE',
      message: maintenance.message,
      details: { endsAt: maintenance.endsAt },
    });
  }
}

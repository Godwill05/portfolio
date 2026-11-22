import type { Permission, UserRole } from '../../common/constants/domain';

/** Shape attached to `request.user` after JWT verification. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  sessionId: string;
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: UserRole;
  sid: string;
  typ: 'access';
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string;
  sid: string;
  fam: string;
  typ: 'refresh';
  iat?: number;
  exp?: number;
}

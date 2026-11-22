import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from '../../config/app-config';
import { AccountStatus, ROLE_PERMISSIONS, UserRole } from '../../common/constants/domain';
import { User, UserSession } from '../../database/entities/user.entity';
import type { AuthenticatedUser, JwtAccessPayload } from './types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfig,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserSession) private readonly sessions: Repository<UserSession>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    if (payload.typ !== 'access') throw new UnauthorizedException('Invalid token type');

    // The session must still be alive: revocation is immediate, not TTL-based.
    const session = await this.sessions.findOne({
      where: { id: payload.sid },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }
    if (session.userId !== payload.sub) throw new UnauthorizedException('Session mismatch');

    const user = await this.users.findOne({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.status === AccountStatus.DISABLED || user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('Account not active');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role] ?? ROLE_PERMISSIONS[UserRole.USER],
      sessionId: session.id,
    };
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User, UserSession, EmailToken } from '../../database/entities/user.entity';
import { ProfessionalProfile } from '../../database/entities/profile.entity';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { AiQuotaService } from '../ai/quota.service';
import { QuotaLedger, QuotaPolicy } from '../../database/entities/platform.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSession,
      EmailToken,
      ProfessionalProfile,
      QuotaLedger,
      QuotaPolicy,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    MailModule,
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AiQuotaService],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}

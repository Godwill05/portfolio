import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiUsageLog,
  AuditLog,
  ContactMessage,
  JobOpportunity,
  QuotaLedger,
  RewardedAdClaim,
  Transaction,
} from '../../database/entities/platform.entity';
import { Cv } from '../../database/entities/cv.entity';
import { UserSession } from '../../database/entities/user.entity';
import {
  Education,
  Experience,
  ProfessionalProfile,
  Project,
  Skill,
} from '../../database/entities/profile.entity';
import { User } from '../../database/entities/user.entity';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { AdminController } from './admin.controller';
import { AdminAnalyticsService, AdminUsersService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSession,
      AuditLog,
      AiUsageLog,
      ProfessionalProfile,
      Cv,
      JobOpportunity,
      ContactMessage,
      Transaction,
      RewardedAdClaim,
      QuotaLedger,
      Skill,
      Project,
      Experience,
      Education,
    ]),
    AuditModule,
    AiModule,
  ],
  controllers: [AdminController],
  providers: [AdminUsersService, AdminAnalyticsService],
  exports: [AdminUsersService, AdminAnalyticsService],
})
export class AdminModule {}

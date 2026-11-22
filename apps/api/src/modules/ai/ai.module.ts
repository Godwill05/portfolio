import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiConversation,
  AiMessage,
  AiModel,
  AiProvider,
  AiTaskRoute,
  AiUsageLog,
  JobOpportunity,
  QuotaLedger,
  QuotaPolicy,
  RewardedAdClaim,
} from '../../database/entities/platform.entity';
import {
  Education,
  Experience,
  Language_,
  ProfessionalProfile,
  Project,
  Skill,
} from '../../database/entities/profile.entity';
import { User } from '../../database/entities/user.entity';
import { AiService } from './ai.service';
import { AiGatewayService } from './ai-gateway.service';
import { AiProviderService } from './provider.service';
import { AiQuotaService } from './quota.service';
import { RewardedAdService } from './rewarded-ad.service';
import { ProviderFactory } from './providers/provider.factory';
import { AiController } from './ai.controller';
import { AiAdminController } from './ai-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiProvider,
      AiModel,
      AiTaskRoute,
      AiConversation,
      AiMessage,
      AiUsageLog,
      QuotaLedger,
      QuotaPolicy,
      RewardedAdClaim,
      JobOpportunity,
      ProfessionalProfile,
      Skill,
      Experience,
      Education,
      Project,
      Language_,
      User,
    ]),
  ],
  controllers: [AiController, AiAdminController],
  providers: [
    AiService,
    AiGatewayService,
    AiProviderService,
    AiQuotaService,
    RewardedAdService,
    ProviderFactory,
  ],
  exports: [AiService, AiGatewayService, AiProviderService, AiQuotaService, RewardedAdService],
})
export class AiModule {}

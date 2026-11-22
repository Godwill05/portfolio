import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../auth/types';
import { AiService } from './ai.service';
import { AiQuotaService } from './quota.service';
import { RewardedAdService } from './rewarded-ad.service';

class ChatDto {
  @IsString() @MinLength(1) @MaxLength(8000) message!: string;
  @IsOptional() @IsString() conversationId?: string;
  @IsOptional() @IsString() modelId?: string | null;
}

class OptimizeCvDto {
  @IsOptional() @IsString() @MaxLength(200) targetRole?: string;
  @IsOptional() @IsString() @MaxLength(60) section?: string;
  @IsOptional() @IsString() @MaxLength(8000) currentText?: string;
  @IsOptional() @IsString() modelId?: string | null;
}

class GenerateCvDto {
  @IsOptional() @IsString() @MaxLength(200) targetRole?: string;
  @IsOptional() @IsString() @MaxLength(60) style?: string;
  @IsOptional() @IsString() modelId?: string | null;
}

class AnalyzeJobDto {
  @IsOptional() @IsString() @MaxLength(40000) text?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsString() @MaxLength(400) sourceUrl?: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsBoolean() save?: boolean;
  @IsOptional() @IsString() modelId?: string | null;
}

class CoverLetterDto {
  @IsString() @MaxLength(200) jobTitle!: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsString() @MaxLength(30000) jobText!: string;
  @IsOptional() @IsString() modelId?: string | null;
}

class CareerCoachDto {
  @IsString() @MinLength(10) @MaxLength(2000) goal!: string;
  @IsOptional() @IsString() modelId?: string | null;
}

class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() status?: string;
}

class RenameConversationDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
}

class PinDto {
  @IsBoolean() pinned!: boolean;
}

class UpdateOpportunityDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
}

@ApiTags('AI Assistant')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly quota: AiQuotaService,
    private readonly rewardedAds: RewardedAdService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Disponibilité de l’assistant et modèles accessibles' })
  async status(@CurrentUser() user: AuthenticatedUser) {
    const [models, summary] = await Promise.all([
      this.ai.modelsAvailable(),
      this.quota.summaryFor(user.id),
    ]);
    return { models, quota: summary };
  }

  @Get('quota')
  @ApiOperation({ summary: 'État détaillé de mes quotas IA' })
  quotaSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.quota.summaryFor(user.id);
  }

  @Get('quota/history')
  @ApiOperation({ summary: 'Historique de consommation' })
  quotaHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.quota.history(user.id, 60);
  }

  @Get('context')
  @ApiOperation({ summary: 'Aperçu transparent du contexte envoyé au modèle' })
  context(@CurrentUser() user: AuthenticatedUser) {
    return this.ai.contextPreview(user.id);
  }

  // ── Conversations ──

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.ai.listConversations(user.id);
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { title?: string },
  ) {
    return this.ai.createConversation(user.id, { title: body.title });
  }

  @Get('conversations/:id')
  getConversation(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.getConversation(user.id, id);
  }

  @Patch('conversations/:id')
  async rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameConversationDto,
  ) {
    await this.ai.renameConversation(user.id, id, dto.title);
    return { success: true };
  }

  @Patch('conversations/:id/pin')
  async pin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PinDto,
  ) {
    await this.ai.togglePin(user.id, id, dto.pinned);
    return { success: true };
  }

  @Delete('conversations/:id')
  async removeConversation(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.ai.deleteConversation(user.id, id);
    return { success: true };
  }

  @Delete('conversations')
  async clearConversations(@CurrentUser() user: AuthenticatedUser) {
    await this.ai.clearConversations(user.id);
    return { success: true };
  }

  /**
   * Server-Sent Events streaming endpoint.
   * Events: `meta` (ids), `delta` (token), `done` (final text + usage), `error`.
   */
  @Post('chat/stream')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Conversation en streaming (SSE)' })
  async chatStream(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    const send = (event: string, data: unknown): void => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const stream = this.ai.streamChat(user.id, {
        conversationId: dto.conversationId,
        message: dto.message,
        modelId: dto.modelId ?? null,
        signal: controller.signal,
      });
      for await (const chunk of stream) {
        send(chunk.type, chunk);
      }
    } catch (error) {
      const err = error as { code?: string; message?: string; response?: { code?: string; message?: string } };
      send('error', {
        type: 'error',
        code: err.response?.code ?? err.code ?? 'AI_ERROR',
        message: err.response?.message ?? err.message ?? 'Erreur inattendue',
      });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Conversation simple (non streaming)' })
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChatDto) {
    return this.ai.chat(user.id, {
      message: dto.message,
      conversationId: dto.conversationId,
      modelId: dto.modelId ?? null,
    });
  }

  // ── Career features ──

  @Post('cv/optimize')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Optimiser le contenu du CV (sans invention de faits)' })
  optimizeCv(@CurrentUser() user: AuthenticatedUser, @Body() dto: OptimizeCvDto) {
    return this.ai.optimizeCv(user.id, dto);
  }

  @Post('cv/generate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Générer un résumé et des points forts depuis le profil' })
  generateCv(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateCvDto) {
    return this.ai.generateCvContent(user.id, dto);
  }

  @Post('jobs/analyze')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Analyser une offre d’emploi face au profil' })
  analyzeJob(@CurrentUser() user: AuthenticatedUser, @Body() dto: AnalyzeJobDto) {
    return this.ai.analyzeJob(user.id, dto);
  }

  @Post('cover-letter')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Générer une lettre de motivation' })
  coverLetter(@CurrentUser() user: AuthenticatedUser, @Body() dto: CoverLetterDto) {
    return this.ai.generateCoverLetter(user.id, dto);
  }

  @Post('career/plan')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Plan de carrière personnalisé' })
  careerPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: CareerCoachDto) {
    return this.ai.careerCoach(user.id, dto);
  }

  // ── Opportunities ──

  @Get('opportunities')
  listOpportunities(@CurrentUser() user: AuthenticatedUser, @Query() query: ListQueryDto) {
    return this.ai.listOpportunities(user.id, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
    });
  }

  @Get('opportunities/:id')
  getOpportunity(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.getOpportunity(user.id, id);
  }

  @Patch('opportunities/:id')
  updateOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.ai.updateOpportunity(user.id, id, dto);
  }

  @Delete('opportunities/:id')
  async deleteOpportunity(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.ai.deleteOpportunity(user.id, id);
    return { success: true };
  }

  // ── Rewarded ads (anti-abuse) ──

  @Post('quota/rewarded-ad/start')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Démarrer une session publicitaire récompensée (si configurée)' })
  startRewardedAd(@CurrentUser() user: AuthenticatedUser) {
    return this.rewardedAds.start(user.id);
  }
}

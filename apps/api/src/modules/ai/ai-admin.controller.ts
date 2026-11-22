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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { AiProviderKind, AiTaskType, Permission } from '../../common/constants/domain';
import type { AuthenticatedUser } from '../auth/types';
import { AiProviderService } from './provider.service';
import { AiGatewayService } from './ai-gateway.service';
import { AuditService } from '../audit/audit.service';

class CreateProviderDto {
  @IsString() @MinLength(2) @MaxLength(60) slug!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEnum(AiProviderKind) kind!: AiProviderKind;
  @IsOptional() @IsString() @MaxLength(400) baseUrl?: string;
  @IsOptional() @IsString() @MaxLength(400) apiKey?: string;
  @IsOptional() @IsObject() extraHeaders?: Record<string, string>;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() priority?: number;
}

class UpdateProviderDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(400) baseUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(400) apiKey?: string | null;
  @IsOptional() @IsObject() extraHeaders?: Record<string, string> | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) priority?: number;
  @IsOptional() @IsInt() @Min(5000) @Max(300000) timeoutMs?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5) maxRetries?: number;
  @IsOptional() @IsInt() @Min(0) requestsPerMinute?: number;
  @IsOptional() @IsInt() @Min(0) dailyRequestLimit?: number;
  @IsOptional() @IsInt() @Min(0) monthlyBudgetCents?: number;
}

class AddModelDto {
  @IsString() @MaxLength(160) modelId!: string;
  @IsString() @MaxLength(160) displayName!: string;
  @IsOptional() @IsInt() contextWindow?: number;
  @IsOptional() @IsInt() maxOutputTokens?: number;
  @IsOptional() @IsInt() inputPricePerMTok?: number;
  @IsOptional() @IsInt() outputPricePerMTok?: number;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsObject() params?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateModelDto {
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsInt() contextWindow?: number;
  @IsOptional() @IsInt() maxOutputTokens?: number;
  @IsOptional() @IsInt() inputPricePerMTok?: number;
  @IsOptional() @IsInt() outputPricePerMTok?: number;
  @IsOptional() @IsString() @MaxLength(400) description?: string | null;
  @IsOptional() @IsObject() params?: Record<string, unknown> | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

class ImportedModelDto {
  @IsString() @MaxLength(160) modelId!: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsInt() contextWindow?: number;
  @IsOptional() @IsInt() maxOutputTokens?: number;
}

class ImportModelsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportedModelDto)
  models!: ImportedModelDto[];
}

class RouteDto {
  @IsOptional() @IsString() primaryModelId?: string | null;
  @IsOptional() @IsString() fallbackModelId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2) temperature?: number;
  @IsOptional() @IsInt() @Min(0) maxOutputTokens?: number;
}

@ApiTags('Admin · AI')
@ApiBearerAuth()
@Controller('admin/ai')
export class AiAdminController {
  constructor(
    private readonly providers: AiProviderService,
    private readonly gateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  @Get('providers')
  @RequirePermissions(Permission.AI_PROVIDERS_READ)
  @ApiOperation({ summary: 'Lister les fournisseurs IA configurés' })
  listProviders() {
    return this.providers.list();
  }

  @Post('providers')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  @ApiOperation({ summary: 'Ajouter un fournisseur IA' })
  async createProvider(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProviderDto) {
    const provider = await this.providers.create(dto);
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'ai.provider_created',
      entity: 'ai_provider',
      entityId: provider.id,
      changes: { slug: dto.slug, kind: dto.kind },
    });
    return provider;
  }

  @Patch('providers/:id')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  @ApiOperation({ summary: 'Mettre à jour un fournisseur (clé API, limites, activation…)' })
  async updateProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ) {
    const provider = await this.providers.update(id, dto);
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'ai.provider_updated',
      entity: 'ai_provider',
      entityId: id,
      changes: { fields: Object.keys(dto).filter((k) => k !== 'apiKey') },
    });
    return provider;
  }

  @Delete('providers/:id')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  async removeProvider(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.providers.remove(id);
    await this.audit.log({
      actorId: user.id,
      actorEmail: user.email,
      action: 'ai.provider_deleted',
      entity: 'ai_provider',
      entityId: id,
    });
    return { success: true };
  }

  @Post('providers/:id/test')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  @ApiOperation({ summary: 'Tester la connexion à un fournisseur' })
  testProvider(@Param('id', ParseUUIDPipe) id: string) {
    return this.providers.healthCheck(id);
  }

  @Get('providers/:id/models/discover')
  @RequirePermissions(Permission.AI_PROVIDERS_READ)
  @ApiOperation({ summary: 'Découvrir les modèles disponibles chez le fournisseur' })
  discoverModels(@Param('id', ParseUUIDPipe) id: string) {
    return this.providers.discoverModels(id);
  }

  @Post('providers/:id/models/import')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  @ApiOperation({ summary: 'Importer une sélection de modèles' })
  importModels(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportModelsDto) {
    return this.providers.importModels(id, dto.models);
  }

  @Post('providers/:id/models')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  addModel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddModelDto) {
    return this.providers.addModel(id, dto);
  }

  @Patch('models/:id')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  updateModel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateModelDto) {
    return this.providers.updateModel(id, dto);
  }

  @Delete('models/:id')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  async removeModel(@Param('id', ParseUUIDPipe) id: string) {
    await this.providers.removeModel(id);
    return { success: true };
  }

  @Get('routes')
  @RequirePermissions(Permission.AI_PROVIDERS_READ)
  @ApiOperation({ summary: 'Routage par type de tâche (CV, chat, analyse…)' })
  listRoutes() {
    return this.providers.listRoutes();
  }

  @Patch('routes/:task')
  @RequirePermissions(Permission.AI_PROVIDERS_WRITE)
  upsertRoute(@Param('task') task: string, @Body() dto: RouteDto) {
    if (!Object.values(AiTaskType).includes(task as AiTaskType)) {
      return { error: 'unknown_task' };
    }
    return this.providers.upsertRoute(task as AiTaskType, dto);
  }

  @Get('ready')
  @RequirePermissions(Permission.AI_PROVIDERS_READ)
  async ready() {
    return { configured: await this.gateway.isConfigured() };
  }
}

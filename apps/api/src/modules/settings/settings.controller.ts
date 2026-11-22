import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { SettingsService } from './settings.service';
import { CurrentUser, Public, RequirePermissions, RequestContext } from '../../common/decorators';
import { Permission, SettingKey } from '../../common/constants/domain';
import type { AuthenticatedUser } from '../auth/types';
import type { AllSettings } from './settings.defaults';
import { Errors } from '../../common/utils/errors';

class UpdateSettingsDto {
  @IsObject()
  value!: Record<string, unknown>;
}

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Lire tous les paramètres (secrets masqués)' })
  async list() {
    return this.settings.sanitizeForClient();
  }

  @Patch(':key')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Mettre à jour un groupe de paramètres' })
  async update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @RequestContext() ctx: { ip: string; userAgent: string },
  ) {
    if (!Object.values(SettingKey).includes(key as SettingKey)) {
      throw Errors.notFound('Paramètre');
    }
    const result = await this.settings.update(key as keyof AllSettings, dto.value, {
      id: user.id,
      email: user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    // Never echo secrets back.
    const sanitized = this.settings.sanitizeForClient();
    return sanitized[key] ?? result;
  }

  @Post('reload')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Recharger le cache des paramètres' })
  async reload() {
    await this.settings.reload();
    return { success: true };
  }
}

@ApiTags('Settings')
@Controller()
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('bootstrap')
  @ApiOperation({ summary: 'Configuration publique, branding et drapeaux de fonctionnalités' })
  bootstrap() {
    return this.settings.publicBootstrap();
  }

  @Public()
  @Get('settings/public')
  @ApiOperation({ summary: 'Alias public de la configuration' })
  publicSettings() {
    return this.settings.publicBootstrap();
  }
}

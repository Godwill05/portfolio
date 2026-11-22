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
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AccountStatus,
  AiFeature,
  Permission,
  UserRole,
} from '../../common/constants/domain';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../auth/types';
import { AdminAnalyticsService, AdminUsersService } from './admin.service';

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

class UserQuery extends PageQuery {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
}

class AuditQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(80) action?: string;
}

class UpdateUserDto {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
}

class AdjustQuotaDto {
  @IsIn([...Object.values(AiFeature), '*']) feature!: string;
  @Type(() => Number) @IsInt() @Min(-500) @Max(500) delta!: number;
  @IsString() @MinLength(3) @MaxLength(200) note!: string;
}

class WindowQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days = 30;
}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly analytics: AdminAnalyticsService,
  ) {}

  // ─────────────────────────── dashboard ───────────────────────────

  @Get('analytics/overview')
  @RequirePermissions(Permission.STATS_READ)
  overview(@Query() query: WindowQuery) {
    return this.analytics.overview(query.days);
  }

  @Get('analytics/timeseries')
  @RequirePermissions(Permission.STATS_READ)
  timeseries(@Query() query: WindowQuery) {
    return this.analytics.timeseries(query.days);
  }

  // ─────────────────────────── users ───────────────────────────

  @Get('users')
  @RequirePermissions(Permission.USERS_READ)
  listUsers(@Query() query: UserQuery) {
    return this.users.list(query);
  }

  @Get('users/:id')
  @RequirePermissions(Permission.USERS_READ)
  userDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.detail(id);
  }

  @Patch('users/:id')
  @RequirePermissions(Permission.USERS_WRITE)
  updateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor.id, actor.email, id, dto);
  }

  @Post('users/:id/quota')
  @RequirePermissions(Permission.USERS_QUOTA)
  adjustQuota(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustQuotaDto,
  ) {
    return this.users.adjustQuota(actor.id, actor.email, id, dto);
  }

  @Get('users/:id/sessions')
  @RequirePermissions(Permission.USERS_READ)
  userSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.sessions(id);
  }

  @Post('users/:id/sessions/revoke')
  @RequirePermissions(Permission.USERS_WRITE)
  revokeSessions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.revokeSessions(actor.id, actor.email, id);
  }

  @Delete('users/:id')
  @RequirePermissions(Permission.USERS_WRITE)
  deleteUser(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.remove(actor.id, actor.email, id);
  }

  // ─────────────────────────── audit ───────────────────────────

  @Get('audit')
  @RequirePermissions(Permission.AUDIT_READ)
  audit(@Query() query: AuditQuery) {
    return this.users.auditLog(query);
  }
}

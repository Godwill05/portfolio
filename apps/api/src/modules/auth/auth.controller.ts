import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  DeleteAccountDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { CurrentUser, Public, RequestContext } from '../../common/decorators';
import type { AuthenticatedUser } from './types';
import { AppConfig } from '../../config/app-config';
import { SettingsService } from '../settings/settings.service';
import { Errors } from '../../common/utils/errors';

const REFRESH_COOKIE = 'ff_refresh';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
  ) {}

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.cookie.secure,
      sameSite: this.config.isProduction ? 'strict' : 'lax',
      domain: this.config.cookie.domain,
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth', domain: this.config.cookie.domain });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Créer un compte utilisateur' })
  async register(
    @Body() dto: RegisterDto,
    @RequestContext() ctx: { ip: string; userAgent: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.settings.features.registration) {
      throw Errors.forbidden('Les inscriptions sont temporairement fermées.');
    }
    const result = await this.auth.register(dto, ctx);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authentifier un utilisateur' })
  async login(
    @Body() dto: LoginDto,
    @RequestContext() ctx: { ip: string; userAgent: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, ctx);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotation du jeton de rafraîchissement' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request & { cookies?: Record<string, string> },
    @RequestContext() ctx: { ip: string; userAgent: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] ?? dto.refreshToken;
    if (!token) throw new UnauthorizedException('Aucune session à rafraîchir');
    const result = await this.auth.refresh(token, ctx);
    this.setRefreshCookie(res, result.tokens.refreshToken);
    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Fermer la session courante' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.sessionId);
    this.clearRefreshCookie(res);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Fermer toutes les sessions actives' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id);
    this.clearRefreshCookie(res);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Profil authentifié courant' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const [profile, quota] = await Promise.all([
      this.auth.me(user.id),
      this.auth.getQuotaSummary(user.id),
    ]);
    return { user: profile, quota };
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'Lister les sessions actives' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Révoquer une session distante' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const sessionId = req.params['id'] as string;
    await this.auth.revokeSession(user.id, sessionId);
    return { success: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander la réinitialisation du mot de passe' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    return {
      message:
        'Si un compte existe pour cet email, un lien de réinitialisation vient d’être envoyé.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe via un jeton' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @RequestContext() ctx: { ip: string; userAgent: string },
  ) {
    await this.auth.resetPassword(dto.token, dto.password, ctx);
    return { message: 'Mot de passe mis à jour. Vous pouvez vous connecter.' };
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Changer le mot de passe' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @RequestContext() ctx: { ip: string; userAgent: string },
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier l’adresse email' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { message: 'Adresse email confirmée.' };
  }

  @ApiBearerAuth()
  @Post('verify-email/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiOperation({ summary: 'Renvoyer l’email de vérification' })
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.requestVerification(user.id);
    return { message: 'Email de vérification envoyé.' };
  }

  @ApiBearerAuth()
  @Delete('account')
  @ApiOperation({ summary: 'Supprimer définitivement son compte' })
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @RequestContext() ctx: { ip: string; userAgent: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.deleteAccount(user.id, dto.password);
    this.clearRefreshCookie(res);
    return { message: 'Compte supprimé.' };
  }
}

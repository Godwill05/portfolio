import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from './env.validation';

/**
 * Typed façade over ConfigService so business code never depends on raw string keys.
 */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  private get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    const value = this.config.get(key, { infer: true });
    if (value !== undefined && value !== null) return value;
    // Fallback to process.env lets AppConfig work outside a fully wired
    // ConfigModule (CLI scripts, tests) while keeping defaults sane.
    const raw = process.env[key as string];
    if (raw === undefined) return value as EnvironmentVariables[K];
    return raw as EnvironmentVariables[K];
  }

  get nodeEnv() {
    return this.get('NODE_ENV');
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get port() {
    return this.get('API_PORT');
  }

  get apiPrefix() {
    return this.get('API_PREFIX');
  }

  get publicAppUrl() {
    return this.get('PUBLIC_APP_URL');
  }

  get corsOrigins() {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  get db() {
    return {
      host: this.get('DB_HOST'),
      port: this.get('DB_PORT'),
      username: this.get('DB_USERNAME'),
      password: this.get('DB_PASSWORD'),
      database: this.get('DB_DATABASE'),
      logging: this.get('DB_LOGGING'),
      poolSize: this.get('DB_POOL_SIZE'),
    };
  }

  get jwt() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      accessTtl: this.get('JWT_ACCESS_TTL'),
      refreshTtl: this.get('JWT_REFRESH_TTL'),
    };
  }

  get encryptionKey() {
    return this.get('ENCRYPTION_KEY');
  }

  get cookie() {
    return {
      domain: this.get('COOKIE_DOMAIN') || undefined,
      secure: this.get('COOKIE_SECURE') || this.isProduction,
    };
  }

  get throttle() {
    return {
      ttl: this.get('THROTTLE_TTL'),
      limit: this.get('THROTTLE_LIMIT'),
      authLimit: this.get('AUTH_THROTTLE_LIMIT'),
    };
  }

  get storage() {
    return {
      driver: this.get('STORAGE_DRIVER'),
      localPath: this.get('STORAGE_LOCAL_PATH'),
      maxUploadMb: this.get('MAX_UPLOAD_MB'),
    };
  }

  get mail() {
    return {
      from: this.get('MAIL_FROM'),
      host: this.get('SMTP_HOST'),
      port: this.get('SMTP_PORT'),
      secure: this.get('SMTP_SECURE'),
      user: this.get('SMTP_USER'),
      password: this.get('SMTP_PASSWORD'),
      configured: Boolean(this.get('SMTP_HOST')),
    };
  }

  get ai() {
    return {
      timeoutMs: this.get('AI_REQUEST_TIMEOUT_MS'),
      maxOutputTokens: this.get('AI_MAX_OUTPUT_TOKENS'),
      dailyRequestsPerUser: this.get('AI_DAILY_REQUESTS_PER_USER'),
    };
  }
}

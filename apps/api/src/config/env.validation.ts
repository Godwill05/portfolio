import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Strongly typed, validated process environment.
 * A misconfigured deployment fails fast at boot instead of at request time.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT = 4000;

  @IsString()
  API_PREFIX = 'api';

  @IsString()
  @IsNotEmpty()
  PUBLIC_APP_URL = 'http://localhost:4200';

  @IsString()
  CORS_ORIGINS = 'http://localhost:4200';

  @IsString()
  DB_HOST = '127.0.0.1';

  @IsInt()
  DB_PORT = 3306;

  @IsString()
  DB_USERNAME = 'portfolio';

  @IsString()
  DB_PASSWORD = '';

  @IsString()
  DB_DATABASE = 'portfolio';

  @IsOptional()
  @IsBoolean()
  DB_LOGGING = false;

  @IsInt()
  DB_POOL_SIZE = 10;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET = '';

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET = '';

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  JWT_REFRESH_TTL = '30d';

  /** 32-byte key (hex or base64) used to encrypt provider secrets at rest. */
  @IsString()
  ENCRYPTION_KEY = '';

  @IsOptional()
  @IsString()
  COOKIE_DOMAIN = '';

  @IsOptional()
  @IsBoolean()
  COOKIE_SECURE = false;

  @IsInt()
  THROTTLE_TTL = 60;

  @IsInt()
  THROTTLE_LIMIT = 120;

  @IsInt()
  AUTH_THROTTLE_LIMIT = 10;

  @IsOptional()
  @IsString()
  ADMIN_EMAIL = 'admin@folioforge.local';

  @IsOptional()
  @IsString()
  ADMIN_PASSWORD = '';

  @IsOptional()
  @IsString()
  ADMIN_NAME = 'Platform Administrator';

  @IsIn(['local', 's3'])
  STORAGE_DRIVER: 'local' | 's3' = 'local';

  @IsString()
  STORAGE_LOCAL_PATH = './storage/uploads';

  @IsInt()
  MAX_UPLOAD_MB = 8;

  @IsOptional()
  @IsString()
  MAIL_FROM = 'FolioForge <no-reply@folioforge.local>';

  @IsOptional()
  @IsString()
  SMTP_HOST = '';

  @IsOptional()
  @IsInt()
  SMTP_PORT = 587;

  @IsOptional()
  @IsBoolean()
  SMTP_SECURE = false;

  @IsOptional()
  @IsString()
  SMTP_USER = '';

  @IsOptional()
  @IsString()
  SMTP_PASSWORD = '';

  @IsInt()
  AI_REQUEST_TIMEOUT_MS = 60000;

  @IsInt()
  AI_MAX_OUTPUT_TOKENS = 2048;

  @IsInt()
  AI_DAILY_REQUESTS_PER_USER = 3;

  @IsOptional()
  @IsString()
  FEDAPAY_SECRET_KEY = '';

  @IsOptional()
  @IsString()
  FEDAPAY_PUBLIC_KEY = '';

  @IsOptional()
  @IsString()
  FEDAPAY_ENVIRONMENT = 'sandbox';

  @IsOptional()
  @IsString()
  PAYPAL_CLIENT_ID = '';

  @IsOptional()
  @IsString()
  PAYPAL_CLIENT_SECRET = '';

  @IsOptional()
  @IsString()
  PAYPAL_ENVIRONMENT = 'sandbox';

  @IsOptional()
  @IsString()
  PAYPAL_DONATION_URL = '';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const toBool = (v: unknown): unknown =>
    typeof v === 'string' ? ['true', '1', 'yes'].includes(v.toLowerCase()) : v;
  const toInt = (v: unknown): unknown => {
    if (typeof v !== 'string' || v.trim() === '') return v;
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
  };

  const booleanKeys = ['DB_LOGGING', 'COOKIE_SECURE', 'SMTP_SECURE'];
  const intKeys = [
    'API_PORT',
    'DB_PORT',
    'DB_POOL_SIZE',
    'THROTTLE_TTL',
    'THROTTLE_LIMIT',
    'AUTH_THROTTLE_LIMIT',
    'MAX_UPLOAD_MB',
    'SMTP_PORT',
    'AI_REQUEST_TIMEOUT_MS',
    'AI_MAX_OUTPUT_TOKENS',
    'AI_DAILY_REQUESTS_PER_USER',
  ];

  const normalized: Record<string, unknown> = { ...config };
  for (const key of booleanKeys) if (key in normalized) normalized[key] = toBool(normalized[key]);
  for (const key of intKeys) if (key in normalized) normalized[key] = toInt(normalized[key]);

  const instance = plainToInstance(EnvironmentVariables, normalized, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(instance, { skipMissingProperties: false, whitelist: true });
  if (errors.length) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }
  return instance;
}

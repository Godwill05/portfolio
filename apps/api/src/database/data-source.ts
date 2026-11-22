import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';

/**
 * Single source of truth for the TypeORM DataSource, shared by:
 *  - the Nest runtime (see DatabaseModule)
 *  - the CLI (migrations / seeds)
 *  - the test harness
 */
const rootDir = join(__dirname, '../..');
const repoRoot = join(rootDir, '../..');

for (const candidate of [
  join(repoRoot, '.env'),
  join(rootDir, '.env'),
]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate });
    break;
  }
}

export const buildDataSourceOptions = (overrides: Partial<DataSourceOptions> = {}): DataSourceOptions =>
  ({
    type: 'mysql',
    host: process.env['DB_HOST'] ?? '127.0.0.1',
    port: Number(process.env['DB_PORT'] ?? 3306),
    username: process.env['DB_USERNAME'] ?? 'portfolio',
    password: process.env['DB_PASSWORD'] ?? '',
    database: process.env['DB_DATABASE'] ?? 'portfolio',
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    entities: [join(__dirname, 'entities/**/*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations/*.{ts,js}')],
    // Schema changes go through migrations only — never auto-sync in prod.
    synchronize: false,
    logging: process.env['DB_LOGGING'] === 'true' ? ['error', 'warn', 'migration'] : ['error'],
    migrationsRun: false,
    extra: {
      connectionLimit: Number(process.env['DB_POOL_SIZE'] ?? 10),
      charset: 'utf8mb4_unicode_ci',
      supportBigNumbers: true,
      bigNumberStrings: true,
      dateStrings: true,
      multipleStatements: false,
    },
    ...overrides,
  }) as DataSourceOptions;

export const AppDataSource = new DataSource(buildDataSourceOptions());

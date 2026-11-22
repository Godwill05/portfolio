/**
 * Vitest global setup.
 *
 * Tests must never talk to the real database, email or AI providers, so we
 * publish deterministic env before any module is imported. Values are obviously
 * fake so an accidental production leak is impossible to miss.
 */
import { beforeAll, afterAll } from 'vitest';

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  API_PORT: '4101',
  APP_NAME: 'FolioForge Test',
  APP_URL: 'http://localhost:4201',
  API_URL: 'http://localhost:4101',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_NAME: 'portfolio_test',
  DB_USER: 'portfolio',
  DB_PASSWORD: 'portfolio',
  JWT_ACCESS_SECRET: 'test-access-secret-not-for-production-use-32chars',
  JWT_REFRESH_SECRET: 'test-refresh-secret-not-for-production-use-32chars',
  JWT_ACCESS_TTL: '900',
  JWT_REFRESH_TTL: '604800',
  // 32-byte hex key for SecretCipher.
  ENCRYPTION_KEY: '0'.repeat(64),
  ADMIN_EMAIL: 'admin@test.local',
  ADMIN_PASSWORD: 'TestAdmin!2026',
  MAIL_FROM: 'no-reply@test.local',
  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '1000',
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value;
}

// Fail loudly rather than silently writing to a developer's real database.
if (process.env.DB_NAME && !/_test$/.test(process.env.DB_NAME)) {
  throw new Error(
    `Refusing to run tests against non-test database "${process.env.DB_NAME}" (must end with _test).`,
  );
}

beforeAll(() => {
  // no-op: keeps the global hook available for future shared fixtures
});

afterAll(() => {
  // no-op
});

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * AES-256-GCM envelope used for any secret stored in MySQL
 * (AI provider API keys, payment secrets). Format: `v1:<iv>:<tag>:<ciphertext>`
 * all base64url-encoded.
 */
export class SecretCipher {
  private readonly key: Buffer;

  constructor(rawKey: string) {
    if (!rawKey) {
      throw new Error(
        'ENCRYPTION_KEY is not configured. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    this.key = SecretCipher.normalizeKey(rawKey);
  }

  static normalizeKey(rawKey: string): Buffer {
    const trimmed = rawKey.trim();
    // Accept hex (64 chars) or base64/raw that hashes to 32 bytes.
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 32) return decoded;
    // Deterministic fallback keeps misconfigured keys working but is discouraged;
    // validateEnv + startup check log a warning instead of crashing the platform.
    return createHash('sha256').update(trimmed).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(
      ':',
    );
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error('Malformed encrypted payload');
    }
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64!, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64!, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Non-reversible hint safe to display in the admin UI. */
  static hint(secret: string): string {
    if (!secret) return '';
    if (secret.length <= 8) return '••••';
    return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
  }
}

/** Opaque token generator for refresh tokens, email links, CSRF nonces… */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

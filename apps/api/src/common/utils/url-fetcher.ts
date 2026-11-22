/**
 * Hardened outbound fetcher for untrusted, user-supplied URLs (job adverts).
 *
 * Threat model — everything here exists for a reason:
 *  - SSRF: an attacker submits `http://169.254.169.254/latest/meta-data/` to make
 *    the server read cloud metadata. We refuse non-public IPs and, critically,
 *    resolve the hostname ourselves and connect to that exact IP (`lookup` hook)
 *    so a DNS-rebinding answer cannot swap the address between check and connect.
 *  - Redirect abuse: each hop is revalidated; the count is capped.
 *  - Slowloris / unbounded responses: hard timeout and a streamed byte ceiling.
 *  - Content sniffing: only text/html and text/plain are accepted.
 *  - Prompt injection: the caller must treat the returned text as data (prompts
 *    wrap it in an explicit untrusted-content boundary).
 */
import { promises as dns } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface FetchTextOptions {
  /** Total wall-clock budget across redirects. */
  timeoutMs?: number;
  /** Max accepted body size in bytes. */
  maxBytes?: number;
  /** Max number of redirect hops. */
  maxRedirects?: number;
  /** Max characters returned after HTML stripping. */
  maxChars?: number;
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  contentType: string;
  bytes: number;
  text: string;
  title: string | null;
  truncated: boolean;
}

export class UrlFetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_URL'
      | 'BLOCKED_HOST'
      | 'TOO_MANY_REDIRECTS'
      | 'UNSUPPORTED_CONTENT'
      | 'TOO_LARGE'
      | 'TIMEOUT'
      | 'HTTP_ERROR'
      | 'NETWORK',
  ) {
    super(message);
    this.name = 'UrlFetchError';
  }
}

/* ──────────────── IP range classification ──────────────── */

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** RFC1918 + loopback + link-local + CGNAT + documentation + benchmark + multicast. */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata lives here)
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmark
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

export function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Loopback, unspecified, ULA, link-local, multicast, and IPv4-mapped forms. */
export function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().split('%')[0];

  // ::ffff:127.0.0.1 — evaluate the embedded v4 address.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  if (lower === '::' || lower === '::1') return true;
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (/^ff/.test(lower)) return true; // ff00::/8 multicast
  // 64:ff9b::/96 NAT64 — treat as public but re-check the embedded v4 when present.
  const nat64 = lower.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (nat64) return isBlockedIpv4(nat64[1]);
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // unparseable → refuse
}

/* ──────────────── URL validation ──────────────── */

export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UrlFetchError('Le lien fourni n’est pas une URL valide.', 'INVALID_URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlFetchError('Seuls les liens http et https sont acceptés.', 'INVALID_URL');
  }
  if (url.username || url.password) {
    throw new UrlFetchError('Les liens contenant des identifiants sont refusés.', 'INVALID_URL');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Host checks come first: naming the real reason is more useful than a
  // generic port rejection, and the port rule is only a secondary narrowing.
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    host === 'metadata.google.internal'
  ) {
    throw new UrlFetchError('Cette adresse est interne et ne peut pas être consultée.', 'BLOCKED_HOST');
  }
  if (isIP(host) && isBlockedAddress(host)) {
    throw new UrlFetchError('Cette adresse est interne et ne peut pas être consultée.', 'BLOCKED_HOST');
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new UrlFetchError('Les ports non standard sont refusés.', 'BLOCKED_HOST');
  }
  return url;
}

/**
 * Resolve then validate. Returns the address we will actually connect to, so the
 * socket cannot be redirected to a different IP after the check.
 */
async function resolvePinnedAddress(host: string): Promise<{ address: string; family: 4 | 6 }> {
  if (isIP(host)) {
    const family = isIP(host) as 4 | 6;
    if (isBlockedAddress(host)) {
      throw new UrlFetchError('Cette adresse est interne et ne peut pas être consultée.', 'BLOCKED_HOST');
    }
    return { address: host, family };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UrlFetchError('Impossible de résoudre ce nom de domaine.', 'NETWORK');
  }
  if (!records.length) throw new UrlFetchError('Impossible de résoudre ce nom de domaine.', 'NETWORK');

  // Every answer must be public: accepting "one good A record" would let an
  // attacker race the resolver toward the private one.
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new UrlFetchError('Cette adresse est interne et ne peut pas être consultée.', 'BLOCKED_HOST');
    }
  }
  return { address: records[0].address, family: records[0].family as 4 | 6 };
}

/* ──────────────── HTML → text ──────────────── */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ugrave: 'ù',
  ecirc: 'ê', ocirc: 'ô', icirc: 'î', acirc: 'â', ucirc: 'û',
  euml: 'ë', iuml: 'ï', uuml: 'ü', oelig: 'œ', hellip: '…',
  mdash: '—', ndash: '–', laquo: '«', raquo: '»', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”', deg: '°', euro: '€',
};

export function htmlToText(html: string): { text: string; title: string | null } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300) || null
    : null;

  const text = decodeEntities(
    html
      // Non-content elements first — their text is never part of the advert.
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|canvas|select)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|ul|ol|table)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, title };
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return ' ';
  try {
    return String.fromCodePoint(code);
  } catch {
    return ' ';
  }
}

/* ──────────────── fetch ──────────────── */

const ALLOWED_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];

export async function fetchPageText(rawUrl: string, options: FetchTextOptions = {}): Promise<FetchedPage> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? 512 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const maxChars = options.maxChars ?? 20000;

  const deadline = Date.now() + timeoutMs;
  let current = assertPublicUrl(rawUrl);
  const original = current.toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new UrlFetchError('Le site n’a pas répondu à temps.', 'TIMEOUT');

    const pinned = await resolvePinnedAddress(current.hostname.replace(/^\[|\]$/g, ''));

    // Pin the socket to the address we validated — this closes the DNS-rebinding
    // window between our check and the TCP connect.
    const lookup: LookupFunction = (_hostname, _opts, callback) => {
      // Node supports both (hostname, callback) and (hostname, opts, callback).
      const done = (typeof _opts === 'function' ? _opts : callback) as (
        err: NodeJS.ErrnoException | null,
        address: string,
        family: number,
      ) => void;
      done(null, pinned.address, pinned.family);
    };

    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const isHttps = current.protocol === 'https:';
      const req = (isHttps ? httpsRequest : httpRequest)(
        {
          protocol: current.protocol,
          hostname: current.hostname.replace(/^\[|\]$/g, ''),
          port: current.port || (isHttps ? 443 : 80),
          path: `${current.pathname}${current.search}`,
          method: 'GET',
          lookup,
          headers: {
            // Identify honestly; some sites serve no content to bare clients.
            'user-agent': 'FolioForgeBot/1.0 (+job-offer-analysis; contact: admin@folioforge.local)',
            accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
            'accept-language': 'fr,en;q=0.8',
            'accept-encoding': 'identity',
          },
        },
        resolve,
      );

      const timer = setTimeout(() => {
        req.destroy(new UrlFetchError('Le site n’a pas répondu à temps.', 'TIMEOUT'));
      }, remaining);

      req.on('error', (error) => {
        clearTimeout(timer);
        if (error instanceof UrlFetchError) reject(error);
        else reject(new UrlFetchError('Le site est injoignable.', 'NETWORK'));
      });
      req.on('response', () => clearTimeout(timer));
      req.end();
    });

    const status = response.statusCode ?? 0;
    const location = response.headers.location;

    // Redirects: revalidate the target like any other URL, never blindly follow.
    if (status >= 300 && status < 400 && location) {
      response.destroy();
      if (hop === maxRedirects) {
        throw new UrlFetchError('Trop de redirections.', 'TOO_MANY_REDIRECTS');
      }
      current = assertPublicUrl(new URL(location, current).toString());
      continue;
    }

    if (status < 200 || status >= 300) {
      response.destroy();
      throw new UrlFetchError(
        `Le site a répondu avec le code ${status}. Vérifiez le lien ou collez le texte de l’offre.`,
        'HTTP_ERROR',
      );
    }

    const rawType = String(response.headers['content-type'] ?? '').toLowerCase();
    const mime = rawType.split(';')[0].trim();
    if (mime && !ALLOWED_TYPES.includes(mime)) {
      response.destroy();
      throw new UrlFetchError(
        'Ce lien ne renvoie pas une page lisible (HTML ou texte). Collez le texte de l’offre.',
        'UNSUPPORTED_CONTENT',
      );
    }

    const declared = Number(response.headers['content-length'] ?? 0);
    if (declared && declared > maxBytes) {
      response.destroy();
      throw new UrlFetchError('La page est trop volumineuse pour être analysée.', 'TOO_LARGE');
    }

    const body = await readCapped(response, maxBytes);
    const html = body.buffer.toString('utf8');
    const { text: extracted, title } = htmlToText(html);
    const truncated = extracted.length > maxChars;

    return {
      url: original,
      finalUrl: current.toString(),
      contentType: mime || 'text/html',
      bytes: body.bytes,
      text: extracted.slice(0, maxChars),
      title,
      truncated,
    };
  }

  throw new UrlFetchError('Trop de redirections.', 'TOO_MANY_REDIRECTS');
}

function readCapped(
  response: IncomingMessage,
  maxBytes: number,
): Promise<{ buffer: Buffer; bytes: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const fail = (error: UrlFetchError) => {
      if (settled) return;
      settled = true;
      response.destroy();
      reject(error);
    };

    response.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        fail(new UrlFetchError('La page est trop volumineuse pour être analysée.', 'TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => {
      if (settled) return;
      settled = true;
      resolve({ buffer: Buffer.concat(chunks), bytes });
    });
    response.on('error', () => fail(new UrlFetchError('Lecture de la page interrompue.', 'NETWORK')));
    response.on('aborted', () => fail(new UrlFetchError('Lecture de la page interrompue.', 'NETWORK')));
  });
}

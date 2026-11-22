import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  assertPublicUrl,
  fetchPageText,
  htmlToText,
  isBlockedAddress,
  UrlFetchError,
} from '../src/common/utils/url-fetcher';
import { neutralizeUntrusted } from '../src/modules/ai/prompts';

/* ───────────────────────── IP classification ───────────────────────── */

describe('SSRF — address classification', () => {
  it.each([
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.5.4',
    '172.31.255.254',
    '192.168.1.1',
    '169.254.169.254', // AWS/GCP metadata
    '100.64.0.1', // CGNAT
    '224.0.0.1', // multicast
    '255.255.255.255',
    '198.18.0.1',
    '192.0.2.10',
  ])('blocks private/reserved IPv4 %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '20.50.2.10'])(
    'allows public IPv4 %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );

  it.each(['::1', '::', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])(
    'blocks private/reserved IPv6 %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    },
  );

  it('allows public IPv6', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('refuses unparseable input', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

/* ───────────────────────── URL validation ───────────────────────── */

describe('SSRF — URL validation', () => {
  it.each([
    'http://localhost/admin',
    'http://LOCALHOST:3000/',
    'http://app.localhost/',
    'http://printer.local/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:4000/api/users',
    'http://[::1]/',
    'http://10.0.0.5/',
    'http://192.168.0.1/',
  ])('rejects internal target %s', (url) => {
    expect(() => assertPublicUrl(url)).toThrow(UrlFetchError);
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com/'])(
    'rejects non-http scheme %s',
    (url) => {
      expect(() => assertPublicUrl(url)).toThrow(/http et https/);
    },
  );

  it('rejects credentials embedded in the URL', () => {
    expect(() => assertPublicUrl('https://user:pass@example.com/')).toThrow(/identifiants/);
  });

  it('rejects non-standard ports', () => {
    expect(() => assertPublicUrl('http://example.com:8080/')).toThrow(/ports/);
  });

  it('rejects malformed input', () => {
    expect(() => assertPublicUrl('not a url')).toThrow(/URL valide/);
  });

  it('accepts a normal public https URL', () => {
    const url = assertPublicUrl('https://jobs.example.com/offre/123?ref=x');
    expect(url.hostname).toBe('jobs.example.com');
  });
});

/* ───────────────────────── HTML extraction ───────────────────────── */

describe('HTML → text extraction', () => {
  it('strips scripts, styles and tags but keeps copy', () => {
    const { text, title } = htmlToText(`
      <html><head><title>Offre — Développeur</title>
      <style>body{color:red}</style></head>
      <body><script>alert('x')</script>
      <h1>Développeur Fullstack</h1><p>Nous recherchons un profil TypeScript.</p>
      <ul><li>Angular</li><li>NestJS</li></ul></body></html>`);
    expect(title).toBe('Offre — Développeur');
    expect(text).toContain('Développeur Fullstack');
    expect(text).toContain('Angular');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
  });

  it('decodes named and numeric entities', () => {
    const { text } = htmlToText('<p>R&amp;D &#233;quipe &laquo;senior&raquo; &#x20AC;</p>');
    expect(text).toContain('R&D');
    expect(text).toContain('équipe');
    expect(text).toContain('«senior»');
    expect(text).toContain('€');
  });

  it('survives hostile entity payloads', () => {
    expect(() => htmlToText('<p>&#999999999;</p><p>&#xZZZZ;</p>')).not.toThrow();
  });
});

/* ───────────────────────── live fetch against a local server ───────────────────────── */

describe('fetchPageText — redirect and content guards', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url ?? '/';

      if (url === '/ok') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><head><title>Offre test</title></head><body><p>' + 'Mot '.repeat(400) + '</p></body></html>');
        return;
      }
      if (url === '/redirect-internal') {
        // The classic SSRF pivot: a public-looking hop into private space.
        res.writeHead(302, { location: `http://127.0.0.1:${(server.address() as AddressInfo).port}/ok` });
        res.end();
        return;
      }
      if (url === '/redirect-loop') {
        res.writeHead(302, { location: '/redirect-loop' });
        res.end();
        return;
      }
      if (url === '/pdf') {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.end('%PDF-1.4 not text');
        return;
      }
      if (url === '/huge') {
        res.writeHead(200, { 'content-type': 'text/html' });
        // Stream well past the cap.
        let sent = 0;
        const chunk = 'x'.repeat(16 * 1024);
        const timer = setInterval(() => {
          sent += chunk.length;
          if (sent > 2 * 1024 * 1024) {
            clearInterval(timer);
            res.end();
            return;
          }
          res.write(chunk);
        }, 1);
        return;
      }
      if (url === '/500') {
        res.writeHead(500, { 'content-type': 'text/html' });
        res.end('<h1>boom</h1>');
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const asPublic = (path: string) => `${base}${path}`;

  it('refuses to fetch from a loopback address before opening a socket', async () => {
    await expect(fetchPageText(asPublic('/ok'))).rejects.toThrow(/interne/);
  });

  it('revalidates every redirect hop instead of following blindly', async () => {
    // `127.0.0.1.nip.io` is a public DNS name whose A record is 127.0.0.1 —
    // exactly the DNS-based SSRF that a hostname-only check would miss.
    await expect(
      fetchPageText('http://127.0.0.1.nip.io/ok', { timeoutMs: 4000 }),
    ).rejects.toThrow(/interne/);
  });

  it('names the real reason for an internal target on a non-standard port', () => {
    expect(() => assertPublicUrl('http://127.0.0.1:4000/ok')).toThrow(/interne/);
    expect(() => assertPublicUrl('http://169.254.169.254/')).toThrow(/interne/);
  });

  it('reports blocked hosts distinctly from network failures', () => {
    try {
      assertPublicUrl('http://10.0.0.1/');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as UrlFetchError).code).toBe('BLOCKED_HOST');
    }
  });
});

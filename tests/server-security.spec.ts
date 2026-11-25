import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extractTextBlocks } from '../server/htmlBlocks';
import { BlockedUrlError, createSafeLookup, fetchPublicUrl, isPrivateAddress } from '../server/publicFetch';

// Server-side checks for the self-hosted converter (no browser needed).

test.describe('HTML parsing (no regex denial of service)', () => {
  test('extracts headings, paragraphs and list items', () => {
    const { blocks } = extractTextBlocks('<h1>Title</h1><p>One &amp; two</p><ul><li>A</li><li>B</li></ul><script>evil()</script>');
    expect(blocks).toEqual([
      { tag: 'h1', text: 'Title' },
      { tag: 'p', text: 'One & two' },
      { tag: 'li', text: 'A' },
      { tag: 'li', text: 'B' },
    ]);
  });

  test('keeps list items, decodes entities, skips scripts, handles unclosed paragraphs', () => {
    expect(extractTextBlocks('<ul><li><p>Nested</p></li></ul>').blocks).toEqual([{ tag: 'li', text: 'Nested' }]);
    expect(extractTextBlocks('<p>One<p>Two').blocks.map((b) => b.text)).toEqual(['One', 'Two']);
    expect(extractTextBlocks('<div>Hi</div><script>var secret=1</script>').plainText).toBe('Hi');
  });

  test('2 MB of unclosed tags is processed in linear time', () => {
    const html = '<p>x'.repeat((2 * 1024 * 1024) / 4);
    const start = performance.now();
    const { blocks } = extractTextBlocks(html);
    expect(performance.now() - start).toBeLessThan(3000);
    expect(blocks.length).toBe(html.length / 4);
  });
});

test.describe('URL fetching (SSRF and DNS rebinding)', () => {
  test('private, loopback, link-local and metadata addresses are refused', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  test('IP literals, other schemes and credentials are refused before connecting', async () => {
    for (const url of ['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'ftp://example.com/', 'file:///etc/passwd', 'http://user:pass@example.com/']) {
      await expect(fetchPublicUrl(url), url).rejects.toBeInstanceOf(BlockedUrlError);
    }
  });

  test('DNS rebinding: the connection uses the checked address, so an internal answer is blocked', async () => {
    // A local "internal admin" server that must never be reached
    let hits = 0;
    const server = http.createServer((_req, res) => {
      hits++;
      res.end('internal secret');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;

    // Attacker DNS: answers the first lookup with a public address, every later one with 127.0.0.1
    let calls = 0;
    const rebindingDns = (_host: string, _opts: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => {
      calls++;
      cb(null, [calls === 1 ? { address: '93.184.216.34', family: 4 } : { address: '127.0.0.1', family: 4 }]);
    };
    // Simulate the old "check first" step consuming the public answer
    await new Promise<void>((r) => rebindingDns('rebind.test', {}, () => r()));

    await expect(fetchPublicUrl(`http://rebind.test:${port}/`, { resolve: rebindingDns as never, timeoutMs: 3000 })).rejects.toBeInstanceOf(BlockedUrlError);
    expect(hits).toBe(0);
    server.close();
  });

  test('redirects are followed, but a redirect to an internal address is blocked', async () => {
    // "internal" service on 127.0.0.2 that must never be reached
    let internalHits = 0;
    const internal = http.createServer((_q, r) => {
      internalHits++;
      r.end('secret');
    });
    await new Promise<void>((r) => internal.listen(0, '127.0.0.2', r));
    const internalPort = (internal.address() as { port: number }).port;
    // "public" site on 127.0.0.1: /ok redirects to /final, /evil redirects to the internal service
    const site = http.createServer((q, r) => {
      if (q.url === '/ok') return r.writeHead(302, { location: '/final' }).end();
      if (q.url === '/evil') return r.writeHead(302, { location: `http://127.0.0.2:${internalPort}/` }).end();
      if (q.url === '/evil-name') return r.writeHead(302, { location: `http://internal.test:${internalPort}/` }).end();
      r.end('<p>final page</p>');
    });
    await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
    const sitePort = (site.address() as { port: number }).port;

    // For this test only, 127.0.0.1 plays the "public internet"; everything else private stays blocked
    const policy = (ip: string) => ip !== '127.0.0.1' && isPrivateAddress(ip);
    const dnsMap = ((h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: h === 'internal.test' ? '127.0.0.2' : '127.0.0.1', family: 4 }])) as never;

    const ok = await fetchPublicUrl(`http://127.0.0.1:${sitePort}/ok`, { isBlockedAddress: policy });
    expect(ok.body).toContain('final page');
    await expect(fetchPublicUrl(`http://127.0.0.1:${sitePort}/evil`, { isBlockedAddress: policy })).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(fetchPublicUrl(`http://127.0.0.1:${sitePort}/evil-name`, { isBlockedAddress: policy, resolve: dnsMap })).rejects.toBeInstanceOf(BlockedUrlError);
    expect(internalHits).toBe(0);
    internal.close();
    site.close();
  });

  test('the connection-time lookup returns only validated public addresses', async () => {
    const lookup = createSafeLookup(((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: '93.184.216.34', family: 4 }])) as never);
    const result = await new Promise<unknown>((resolve) => lookup('example.test', { all: true }, (_e, addresses) => resolve(addresses)));
    expect(result).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });
});

test.describe('HTML to PDF endpoint', () => {
  let base = '';
  test.beforeAll(async () => {
    process.env.LPT_EMBEDDED = '1';
    process.env.NODE_ENV = 'production';
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpt-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>test</title>');
    const { startServer } = await import('../server');
    const { port } = await startServer({ port: 0, host: '127.0.0.1', distPath: dist });
    base = `http://127.0.0.1:${port}`;
  });

  test('listens on 127.0.0.1 by default', async () => {
    const src = fs.readFileSync(path.resolve('server.ts'), 'utf8');
    expect(src).toContain('process.env.HOST || "127.0.0.1"');
  });

  test('large malformed HTML is converted quickly instead of blocking the server', async ({ request }) => {
    const start = Date.now();
    const res = await request.post(`${base}/api/convert/html-to-pdf`, { data: { htmlInput: '<p>x'.repeat(400_000) } });
    expect(res.status()).toBe(200);
    expect(Date.now() - start).toBeLessThan(10_000);
    const pdf = await res.body();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(300); // output capped
  });

  test('characters the PDF fonts cannot draw are replaced and flagged, not a crash', async ({ request }) => {
    const res = await request.post(`${base}/api/convert/html-to-pdf`, { data: { htmlInput: '<h1>Title</h1><p>مرحبا</p>' } });
    expect(res.status()).toBe(200);
    expect(res.headers()['x-characters-replaced']).toBe('true');
    const plain = await request.post(`${base}/api/convert/html-to-pdf`, { data: { htmlInput: '<p>Plain English</p>' } });
    expect(plain.headers()['x-characters-replaced']).toBeUndefined();
  });

  test('HTML over 2 MB is rejected', async ({ request }) => {
    const res = await request.post(`${base}/api/convert/html-to-pdf`, { data: { htmlInput: 'a'.repeat(2 * 1024 * 1024 + 1) } });
    expect(res.status()).toBe(413);
  });

  test('a URL resolving to a private address is rejected with 400', async ({ request }) => {
    const res = await request.post(`${base}/api/convert/html-to-pdf`, { data: { urlInput: 'http://localhost:1/' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/private or local/);
  });
});

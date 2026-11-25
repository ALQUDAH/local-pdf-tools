/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Fetches a public web page for HTML -> PDF without letting the server be used to reach
// private networks (SSRF). The address is checked at connection time, inside the socket's
// own DNS lookup, so the address that was validated is the one that is connected to.
// This closes DNS-rebinding attacks, where a second lookup returns an internal address.

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export class BlockedUrlError extends Error {
  constructor(message = 'URLs pointing to private or local networks are not allowed') {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) || // 192.0.0.0/24 and 192.0.2.0/24
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast and reserved
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') || // unique local
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb') || // link-local
      lower.startsWith('fec') || // site-local (deprecated)
      lower.startsWith('ff') || // multicast
      lower.startsWith('64:ff9b:') // NAT64, may map to internal IPv4
    );
  }
  return true; // not an IP address at all: refuse
}

type Resolver = (
  hostname: string,
  options: { all: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void
) => void;

/**
 * A socket `lookup` function that refuses to connect when any resolved address is private.
 * `resolve` is injectable for tests.
 */
export function createSafeLookup(resolve: Resolver = dns.lookup as unknown as Resolver, isBlocked: (ip: string) => boolean = isPrivateAddress) {
  return (
    hostname: string,
    options: dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
  ) => {
    resolve(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      if (!addresses?.length || addresses.some((a) => isBlocked(a.address))) {
        return callback(new BlockedUrlError() as NodeJS.ErrnoException, '', 0);
      }
      if (options?.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

export interface FetchedPage {
  ok: boolean;
  status: number;
  body: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Redirects to follow; every hop is validated again (scheme, credentials, IP literal, DNS). */
  maxRedirects?: number;
  /** Injectable DNS resolver (tests only; never set from request input). */
  resolve?: Resolver;
  /** Injectable address policy (tests only; never set from request input). */
  isBlockedAddress?: (ip: string) => boolean;
}

/** Validates the URL and fetches it with the pinned, validated address. Each redirect hop is validated the same way. */
export function fetchPublicUrl(raw: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const { timeoutMs = 15_000, maxBytes = 10 * 1024 * 1024, maxRedirects = 5, isBlockedAddress = isPrivateAddress } = options;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return Promise.reject(new BlockedUrlError('Invalid URL'));
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return Promise.reject(new BlockedUrlError('Only http(s) URLs are allowed'));
  }
  if (url.username || url.password) {
    return Promise.reject(new BlockedUrlError('URLs with credentials are not allowed'));
  }
  // IP literals skip DNS lookup entirely, so they must be checked here
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlockedAddress(host)) {
    return Promise.reject(new BlockedUrlError());
  }

  const client = url.protocol === 'https:' ? https : http;
  return new Promise<FetchedPage>((resolvePromise, reject) => {
    const req = client.request(
      url,
      {
        method: 'GET',
        lookup: createSafeLookup(options.resolve, isBlockedAddress) as unknown as typeof dns.lookup,
        headers: { 'user-agent': 'LocalPDFTools/1.0 (+html-to-pdf)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          req.destroy();
          if (maxRedirects <= 0) return reject(new BlockedUrlError('Too many redirects'));
          let next: string;
          try {
            next = new URL(res.headers.location, url).href;
          } catch {
            return reject(new BlockedUrlError('Invalid redirect'));
          }
          // The next hop goes through every check again, including the pinned DNS lookup
          return resolvePromise(fetchPublicUrl(next, { ...options, maxRedirects: maxRedirects - 1 }));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new BlockedUrlError('The page is too large to convert'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolvePromise({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
    req.end();
  });
}

import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * SSRF guard for /api/scrape, which fetches an arbitrary user-supplied URL
 * server-side with no restriction. Without this, a pasted URL like
 * http://169.254.169.254/latest/meta-data/ or http://localhost:5432 lets a
 * client read internal services this server can reach.
 *
 * Resolves the hostname and checks the actual IP, not the hostname string —
 * a bare denylist of hostnames ("localhost", "127.0.0.1") is defeated by
 * DNS rebinding (a domain the attacker controls that resolves to a private
 * IP) or unusual formats (0x7f000001, decimal 2130706433, ::ffff:127.0.0.1).
 */

const BLOCKED_V4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
];

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const target = ipToLong(ip);
  return BLOCKED_V4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipToLong(base) & mask);
  });
}

function isBlockedV6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true; // link-local
  if (/^fc[0-9a-f]{2}:|^fd[0-9a-f]{2}:/.test(normalized)) return true; // unique local
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and check the v4 rules
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  return false;
}

export interface UrlSafetyResult {
  safe: boolean;
  reason?: string;
}

/** Validates scheme + resolves the host to check it isn't a private/internal address. */
export async function checkUrlSafety(rawUrl: string): Promise<UrlSafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Not a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Scheme "${parsed.protocol}" is not allowed` };
  }

  const hostname = parsed.hostname;
  if (!hostname || hostname === 'localhost') {
    return { safe: false, reason: 'Host not allowed' };
  }

  // If the hostname is already a literal IP, skip DNS and check it directly.
  if (net.isIP(hostname)) {
    const blocked = net.isIP(hostname) === 4 ? isBlockedV4(hostname) : isBlockedV6(hostname);
    return blocked ? { safe: false, reason: 'Target address is not allowed' } : { safe: true };
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true });
    addresses = records.map((r) => r.address);
  } catch {
    return { safe: false, reason: 'Could not resolve host' };
  }

  if (addresses.length === 0) {
    return { safe: false, reason: 'Could not resolve host' };
  }

  for (const addr of addresses) {
    const family = net.isIP(addr);
    if (family === 4 && isBlockedV4(addr)) {
      return { safe: false, reason: 'Target address is not allowed' };
    }
    if (family === 6 && isBlockedV6(addr)) {
      return { safe: false, reason: 'Target address is not allowed' };
    }
  }

  return { safe: true };
}

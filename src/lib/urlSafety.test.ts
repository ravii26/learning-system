import { describe, it, expect } from 'vitest';
import { checkUrlSafety } from './urlSafety';

describe('checkUrlSafety', () => {
  describe('scheme', () => {
    it('rejects non-http(s) schemes', async () => {
      expect((await checkUrlSafety('file:///etc/passwd')).safe).toBe(false);
      expect((await checkUrlSafety('ftp://example.com/x')).safe).toBe(false);
      expect((await checkUrlSafety('gopher://example.com')).safe).toBe(false);
    });

    it('rejects unparseable input', async () => {
      expect((await checkUrlSafety('not a url')).safe).toBe(false);
      expect((await checkUrlSafety('')).safe).toBe(false);
    });
  });

  describe('literal IPs — loopback, link-local, RFC1918', () => {
    it('blocks loopback', async () => {
      expect((await checkUrlSafety('http://127.0.0.1/')).safe).toBe(false);
      expect((await checkUrlSafety('http://127.0.0.1:5432/')).safe).toBe(false);
    });

    it('blocks the literal hostname "localhost"', async () => {
      expect((await checkUrlSafety('http://localhost/')).safe).toBe(false);
      expect((await checkUrlSafety('http://localhost:3000/')).safe).toBe(false);
    });

    it('blocks cloud metadata (169.254.169.254)', async () => {
      expect((await checkUrlSafety('http://169.254.169.254/latest/meta-data/')).safe).toBe(false);
    });

    it('blocks RFC1918 private ranges', async () => {
      expect((await checkUrlSafety('http://10.0.0.5/')).safe).toBe(false);
      expect((await checkUrlSafety('http://172.16.0.1/')).safe).toBe(false);
      expect((await checkUrlSafety('http://172.31.255.255/')).safe).toBe(false);
      expect((await checkUrlSafety('http://192.168.1.1/')).safe).toBe(false);
    });

    it('does not block a 172.x address outside the 172.16/12 block', async () => {
      // 172.15.x and 172.32.x are public space, not part of 172.16.0.0/12
      expect((await checkUrlSafety('http://172.15.0.1/')).safe).toBe(true);
      expect((await checkUrlSafety('http://172.32.0.1/')).safe).toBe(true);
    });

    it('blocks IPv6 loopback and unique-local', async () => {
      expect((await checkUrlSafety('http://[::1]/')).safe).toBe(false);
      expect((await checkUrlSafety('http://[fd00::1]/')).safe).toBe(false);
      expect((await checkUrlSafety('http://[fe80::1]/')).safe).toBe(false);
    });

    it('unwraps IPv4-mapped IPv6 before checking', async () => {
      // ::ffff:127.0.0.1 is loopback wearing a v6 costume — a naive
      // hostname-string check would miss this.
      expect((await checkUrlSafety('http://[::ffff:127.0.0.1]/')).safe).toBe(false);
      expect((await checkUrlSafety('http://[::ffff:8.8.8.8]/')).safe).toBe(true);
    });

    it('allows a public IP literal', async () => {
      expect((await checkUrlSafety('http://8.8.8.8/')).safe).toBe(true);
    });
  });

  describe('public hostnames', () => {
    it('allows a well-known public domain', async () => {
      const result = await checkUrlSafety('https://example.com/page');
      expect(result.safe).toBe(true);
    }, 10000);
  });
});

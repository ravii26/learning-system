import { checkUrlSafety, type UrlSafetyResult } from '@/lib/urlSafety';

/**
 * Is this link real? Answers only that — never whether the resource is any
 * good (that's the separate `quality` field). Bot-protected sites (LeetCode,
 * Cloudflare) answer 403/429 to servers but work for people, so those count
 * as reachable ("blocked"), not broken.
 */

export type LinkStatus = 'ok' | 'blocked' | 'broken';

export function classifyStatus(httpStatus: number): LinkStatus {
  if (httpStatus >= 200 && httpStatus < 400) return 'ok';
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return 'blocked';
  return 'broken';
}

export const isUsable = (s: LinkStatus) => s !== 'broken';

export interface VerifyDeps {
  fetchImpl?: typeof fetch;
  safety?: (url: string) => Promise<UrlSafetyResult>;
  timeoutMs?: number;
}

const MAX_REDIRECTS = 4;

/**
 * Follows redirects by hand so every hop passes the SSRF guard — a public
 * URL that redirects to 169.254.169.254 is rejected, not fetched.
 */
export async function verifyLink(url: string, deps: VerifyDeps = {}): Promise<{ status: LinkStatus; httpStatus: number | null; finalUrl: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const safety = deps.safety ?? checkUrlSafety;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:\/\//i.test(current)) return { status: 'broken', httpStatus: null, finalUrl: current };
    const safe = await safety(current);
    if (!safe.safe) return { status: 'broken', httpStatus: null, finalUrl: current };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 7000);
    try {
      const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; LearningOS-LinkCheck/1.0)', Accept: 'text/html,*/*' };
      let res = await fetchImpl(current, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal, headers });
      if (res.status === 405 || res.status === 501) {
        res = await fetchImpl(current, { method: 'GET', redirect: 'manual', signal: ctrl.signal, headers });
      }
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current).toString();
        continue;
      }
      return { status: classifyStatus(res.status), httpStatus: res.status, finalUrl: current };
    } catch {
      return { status: 'broken', httpStatus: null, finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: 'broken', httpStatus: null, finalUrl: current }; // redirect loop
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionTokenEdge } from '@/lib/authEdge';

const COOKIE_NAME = 'learning_os_session';
const isProd = process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build';

// No dev fallback in production: an unset secret there must lock everyone
// out, not accept tokens signed with a key that's public in this repo.
const JWT_SECRET = process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production' ? '' : 'learning-os-default-secret-key-change-in-prod');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public and API auth routes pass through
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    // Phone-shortcut capture: authenticates itself with a bearer token
    // (CAPTURE_TOKEN), not the session cookie — see that route.
    pathname === '/api/capture-hook' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check if session cookie exists and signature is valid
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token || !JWT_SECRET || !(await verifySessionTokenEdge(token, JWT_SECRET))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all frontend pages except assets and login
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};

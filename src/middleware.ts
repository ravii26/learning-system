import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'learning_os_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public and API auth routes pass through
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check if session cookie exists
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all frontend pages except assets and login
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};

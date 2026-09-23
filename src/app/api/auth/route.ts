import { NextResponse } from 'next/server';
import { checkPassword, signSessionToken, setSessionCookie, clearSessionCookie, isAuthenticated } from '@/lib/auth';
import { SEED_USER_ID } from '@/lib/currentUser';

export async function GET() {
  const authenticated = isAuthenticated();
  return NextResponse.json({ authenticated });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, password } = body;

    if (action === 'logout') {
      clearSessionCookie();
      return NextResponse.json({ success: true });
    }

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    if (checkPassword(password)) {
      const token = signSessionToken(SEED_USER_ID);
      setSessionCookie(token);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (e) {
    console.error('Auth API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

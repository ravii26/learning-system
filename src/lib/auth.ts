import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const APP_PASSWORD = process.env.APP_PASSWORD || 'learn';
const COOKIE_NAME = 'learning_os_session';

export function signSessionToken(): string {
  return jwt.sign({ auth: true }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifySessionToken(token: string): boolean {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { auth?: boolean };
    return !!decoded.auth;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return false;
  }
}

export function isAuthenticated(): boolean {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export function checkPassword(password: string): boolean {
  return password === APP_PASSWORD;
}

export function setSessionCookie(token: string) {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

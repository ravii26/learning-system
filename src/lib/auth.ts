import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { SEED_USER_ID } from './currentUser';

const isProd = process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build';

const JWT_SECRET = process.env.JWT_SECRET || 'learning-os-default-secret-key-change-in-prod';
const APP_PASSWORD = process.env.APP_PASSWORD || 'learn';
const COOKIE_NAME = 'learning_os_session';

interface SessionTokenPayload {
  auth: true;
  sub: string; // userId
}

export function signSessionToken(userId: string = SEED_USER_ID): string {
  const payload: SessionTokenPayload = { auth: true, sub: userId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/** Decodes and verifies the token, returning the session payload or null. */
export function decodeSessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<SessionTokenPayload>;
    if (!decoded.auth) return null;
    // Legacy tokens signed before `sub` existed are still valid sessions —
    // fall back to the seed user rather than logging everyone out.
    return { auth: true, sub: decoded.sub || SEED_USER_ID };
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string): boolean {
  return decodeSessionToken(token) !== null;
}

export function isAuthenticated(): boolean {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

/** Returns the authenticated request's userId, or null if not authenticated. */
export function getSessionUserId(): string | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSessionToken(token)?.sub ?? null;
}

export function checkPassword(password: string): boolean {
  return password === APP_PASSWORD;
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

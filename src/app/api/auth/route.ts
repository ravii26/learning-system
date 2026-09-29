import { NextResponse } from 'next/server';
import { checkPassword, signSessionToken, setSessionCookie, clearSessionCookie, getSessionUserId } from '@/lib/auth';
import { SEED_USER_ID } from '@/lib/currentUser';
import { db } from '@/lib/db';
import { consume, peek, tooManyRequests, clientIp, MINUTE, HOUR } from '@/lib/rateLimit';
import { hashPassword, verifyPassword, normalizeEmail, isValidEmail, MIN_PASSWORD_LENGTH } from '@/lib/password';

// Public sign-up stays off unless explicitly enabled: every account can
// spend AI credits, so opening the door is a deliberate deploy-time choice.
const signupOpen = () => process.env.ALLOW_SIGNUP === 'true';

// The pre-accounts owner row (seeded by migration). Until it has a password
// of its own, the old shared APP_PASSWORD still signs into it; claiming sets
// email + password and retires that path. (It may already carry an email.)
async function ownerUnclaimed(): Promise<boolean> {
  const owner = await db.user.findUnique({ where: { id: SEED_USER_ID }, select: { passwordHash: true } });
  return !!owner && !owner.passwordHash;
}

function signIn(userId: string) {
  setSessionCookie(signSessionToken(userId));
  return NextResponse.json({ success: true });
}

const invalidLogin = () => NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });

function checkNewCredentials(email: unknown, password: unknown): string | null {
  if (typeof email !== 'string' || !isValidEmail(normalizeEmail(email))) return 'Enter a valid email address.';
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

// Failed sign-ins per 15 minutes, per IP and per email. Only failures
// count, so a user who types their password right is never slowed down.
const FAIL_WINDOW = 15 * MINUTE;
const FAILS_PER_IP = 20;
const FAILS_PER_EMAIL = 8;
const SIGNUPS_PER_IP_HOUR = 5;

function failKeys(ip: string, email?: unknown): [string, number][] {
  const keys: [string, number][] = [[`login-ip:${ip}`, FAILS_PER_IP]];
  if (typeof email === 'string' && email.trim()) keys.push([`login-email:${normalizeEmail(email)}`, FAILS_PER_EMAIL]);
  return keys;
}

async function lockedOut(keys: [string, number][]) {
  for (const [key, limit] of keys) {
    const s = await peek(key, limit, FAIL_WINDOW);
    if (s.blocked) return tooManyRequests('Too many failed attempts. Try again in a few minutes.', s);
  }
  return null;
}

async function recordFailure(keys: [string, number][]) {
  await Promise.all(keys.map(([key, limit]) => consume(key, limit, FAIL_WINDOW)));
}

export async function GET() {
  const userId = getSessionUserId();
  const user = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, aiMode: true } })
    : null;
  return NextResponse.json({
    authenticated: !!user,
    user,
    // The owner account also sees business screens (AI usage and cost).
    isOwner: !!user && userId === SEED_USER_ID,
    signupOpen: signupOpen(),
    ownerUnclaimed: await ownerUnclaimed(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, password, name, appPassword } = body;
    const ip = clientIp(request);

    if (action === 'logout') {
      clearSessionCookie();
      return NextResponse.json({ success: true });
    }

    if (action === 'signup') {
      if (!signupOpen()) return NextResponse.json({ error: 'Sign-up is closed.' }, { status: 403 });
      const signups = await consume(`signup-ip:${ip}`, SIGNUPS_PER_IP_HOUR, HOUR);
      if (signups.blocked) return tooManyRequests('Too many new accounts from this network. Try again later.', signups);
      const problem = checkNewCredentials(email, password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      const normalized = normalizeEmail(email);
      if (await db.user.findUnique({ where: { email: normalized }, select: { id: true } })) {
        return NextResponse.json({ error: 'An account with that email already exists. Sign in instead.' }, { status: 409 });
      }
      const user = await db.user.create({
        data: {
          email: normalized,
          passwordHash: await hashPassword(password),
          name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : null,
        },
      });
      return signIn(user.id);
    }

    if (action === 'claim') {
      if (!(await ownerUnclaimed())) return NextResponse.json({ error: 'This workspace already has an owner account.' }, { status: 409 });
      const keys = failKeys(ip);
      const locked = await lockedOut(keys);
      if (locked) return locked;
      if (typeof appPassword !== 'string' || !checkPassword(appPassword)) {
        await recordFailure(keys);
        return NextResponse.json({ error: 'The current app password is incorrect.' }, { status: 401 });
      }
      const problem = checkNewCredentials(email, password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      const normalized = normalizeEmail(email);
      const holder = await db.user.findUnique({ where: { email: normalized }, select: { id: true } });
      if (holder && holder.id !== SEED_USER_ID) {
        return NextResponse.json({ error: 'That email is already used by another account.' }, { status: 409 });
      }
      await db.user.update({
        where: { id: SEED_USER_ID },
        data: {
          email: normalized,
          passwordHash: await hashPassword(password),
          name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : null,
        },
      });
      return signIn(SEED_USER_ID);
    }

    // Email + password sign-in
    if (typeof email === 'string' && email.trim()) {
      const keys = failKeys(ip, email);
      const locked = await lockedOut(keys);
      if (locked) return locked;
      if (typeof password !== 'string' || !password) return invalidLogin();
      const user = await db.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { id: true, passwordHash: true },
      });
      if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
        await recordFailure(keys);
        return invalidLogin();
      }
      return signIn(user.id);
    }

    // Legacy: shared app password, only until the owner account is claimed.
    if (typeof password === 'string' && password) {
      if (!(await ownerUnclaimed())) {
        return NextResponse.json({ error: 'Sign in with your email and password.' }, { status: 401 });
      }
      const keys = failKeys(ip);
      const locked = await lockedOut(keys);
      if (locked) return locked;
      if (!checkPassword(password)) {
        await recordFailure(keys);
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
      return signIn(SEED_USER_ID);
    }

    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  } catch (e) {
    console.error('Auth API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

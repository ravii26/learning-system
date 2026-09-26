import { NextResponse } from 'next/server';
import { checkPassword, signSessionToken, setSessionCookie, clearSessionCookie, getSessionUserId } from '@/lib/auth';
import { SEED_USER_ID } from '@/lib/currentUser';
import { db } from '@/lib/db';
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

export async function GET() {
  const userId = getSessionUserId();
  const user = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
    : null;
  return NextResponse.json({
    authenticated: !!user,
    user,
    signupOpen: signupOpen(),
    ownerUnclaimed: await ownerUnclaimed(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, password, name, appPassword } = body;

    if (action === 'logout') {
      clearSessionCookie();
      return NextResponse.json({ success: true });
    }

    if (action === 'signup') {
      if (!signupOpen()) return NextResponse.json({ error: 'Sign-up is closed.' }, { status: 403 });
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
      if (typeof appPassword !== 'string' || !checkPassword(appPassword)) {
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
      if (typeof password !== 'string' || !password) return invalidLogin();
      const user = await db.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { id: true, passwordHash: true },
      });
      if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) return invalidLogin();
      return signIn(user.id);
    }

    // Legacy: shared app password, only until the owner account is claimed.
    if (typeof password === 'string' && password) {
      if (!(await ownerUnclaimed())) {
        return NextResponse.json({ error: 'Sign in with your email and password.' }, { status: 401 });
      }
      if (!checkPassword(password)) return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      return signIn(SEED_USER_ID);
    }

    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  } catch (e) {
    console.error('Auth API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

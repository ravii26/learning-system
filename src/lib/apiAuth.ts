import { NextResponse } from 'next/server';
import { getSessionUserId } from './auth';
import { SEED_USER_ID } from './currentUser';

/**
 * Single auth+scoping check for API routes, replacing the checkAuth()
 * copy-pasted across 11 route files (each only checked isAuthenticated()
 * and threw away the userId, so every db.* query below it read every
 * user's rows).
 *
 * Usage:
 *   const auth = requireAuth();
 *   if (auth instanceof NextResponse) return auth;
 *   const { userId } = auth;
 *   // every db.* call below must filter by userId
 */
export function requireAuth(): { userId: string } | NextResponse {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return { userId };
}

/** Like requireAuth, but only the owner account gets through (403 otherwise). */
export function requireOwner(): { userId: string } | NextResponse {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (auth.userId !== SEED_USER_ID) return NextResponse.json({ error: 'Only the owner can use this.' }, { status: 403 });
  return auth;
}

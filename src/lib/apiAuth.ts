import { NextResponse } from 'next/server';
import { getSessionUserId } from './auth';

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

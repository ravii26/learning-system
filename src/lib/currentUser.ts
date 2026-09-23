/**
 * The single seeded user id, matching the fixed uuid inserted by
 * prisma/migrations/20260923051102_add_user_nullable/migration.sql.
 *
 * This exists so every db.* query can be scoped by userId today, even
 * though there is exactly one user. getCurrentUserId() is the only function
 * that should ever read this — routes call it, not the constant directly,
 * so the day sessions carry a real subject this is a one-file change.
 */
export const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Resolves the current request's user id from the session (see
 * src/lib/apiAuth.ts, which decodes the JWT's `sub` claim). Falls back to
 * the seed user only for legacy tokens issued before `sub` existed, so
 * already-logged-in sessions don't get bounced by this migration.
 */
export function resolveUserId(sub?: string | null): string {
  return sub || SEED_USER_ID;
}

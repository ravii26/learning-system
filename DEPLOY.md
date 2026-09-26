# Deploying Learning OS

Vercel (app) + Neon (Postgres). Both have free tiers that fit one user.

## One-time setup

1. **Database** — create a Neon project. Keep both connection strings:
   pooled (`DATABASE_URL`) and direct (`DATABASE_URL_UNPOOLED`).
2. **Vercel** — import the GitHub repo. No build settings to change:
   Vercel runs `npm run vercel-build`, which applies pending Prisma
   migrations (over the direct URL) and then runs `next build`.
3. **Environment variables** (Project Settings → Environment Variables),
   see `.env.example` for the full list:
   - `DATABASE_URL`, `DATABASE_URL_UNPOOLED`
   - `JWT_SECRET` — a new random value, not your local one
   - `APP_PASSWORD` — a strong password; the app refuses to start without it
   - `GROQ_API_KEY` and/or `AICREDITS_API_KEY`
   - `CAPTURE_TOKEN` (optional)
4. **Deploy**, then smoke-test: log in, create a topic, capture a note,
   generate a roadmap. Check Vercel → Logs for errors.
5. **Domain** (optional) — Vercel → Domains, add it, set the DNS records it
   shows. HTTPS is automatic.

## Moving existing local data (optional)

```bash
pg_dump -Fc --no-owner "$LOCAL_DATABASE_URL" -f learning-os.dump
pg_restore --no-owner --clean --if-exists -d "$DATABASE_URL_UNPOOLED" learning-os.dump
```

Restore into a fresh database *before* the first deploy runs migrations, or
restore and then redeploy so `migrate deploy` sees the history table.

## Every deploy after that

Push to the branch Vercel tracks (usually `main`). New migrations in
`prisma/migrations` are applied automatically during the build.

## Before letting other people in

This build is single-user: one shared password, one account. Real sign-up,
a per-user access audit and AI rate limits come first.

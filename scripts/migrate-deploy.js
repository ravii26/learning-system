// Runs `prisma migrate deploy` before the production build (Vercel's
// `vercel-build` script). Migrations need a direct connection: pooled
// (PgBouncer) URLs break Prisma's migration advisory lock, so prefer
// DATABASE_URL_UNPOOLED when the host provides one. POSTGRES_URL is what
// Vercel's Prisma Postgres / Neon integrations set when DATABASE_URL isn't.
// Also runs `prisma generate`: newer npm skips install scripts, so the
// postinstall hook can't be relied on to build the client.
const { execSync } = require('child_process');

const env = process.env;
const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || env.POSTGRES_URL;
if (!url) {
  console.error('migrate-deploy: no database URL. Set DATABASE_URL (or connect a Postgres integration).');
  process.exit(1);
}
if (url.startsWith('prisma+postgres://')) {
  console.error('migrate-deploy: got a prisma+postgres:// URL. Use the plain postgres:// connection string (POSTGRES_URL).');
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env: { ...env, DATABASE_URL: url } });
run('npx prisma generate');
run('npx prisma migrate deploy');

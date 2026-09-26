// Runs `prisma migrate deploy` before the production build (Vercel's
// `vercel-build` script). Migrations need a direct connection: pooled
// (PgBouncer) URLs break Prisma's migration advisory lock, so prefer
// DATABASE_URL_UNPOOLED when the host provides one.
const { execSync } = require('child_process');

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('migrate-deploy: DATABASE_URL is not set');
  process.exit(1);
}
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});

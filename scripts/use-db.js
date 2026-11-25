#!/usr/bin/env node
/**
 * Switch the app database between PostgreSQL (the committed default, used in
 * production) and SQLite (zero-dependency alternative for local development).
 *
 * Prisma's datasource `provider` is a build-time literal (it cannot be an env
 * var), and the generated client is tied to it — so switching DBs means editing
 * the schema + DATABASE_URL and regenerating the client. This script does the
 * first two; the npm wrapper (`db:use:postgres` / `db:use:sqlite`) chains
 * `prisma generate`.
 *
 * Usage: node scripts/use-db.js <postgres|sqlite>
 *
 * It edits, in backend/:
 *   - prisma/schema.prisma  → datasource provider
 *   - .env                  → DATABASE_URL + DB_PROVIDER
 *
 * The committed schema.prisma targets PostgreSQL and the committed migrations
 * are PostgreSQL dialect. Switching to SQLite leaves schema.prisma modified in
 * your working tree: that change is local and must NOT be committed. Run
 * `npm run db:use:postgres` to restore the committed provider.
 *
 * The Postgres URL matches the `postgres` service in docker-compose.yml
 * (override with DT_POSTGRES_URL if your local Postgres differs).
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const target = (process.argv[2] || '').toLowerCase()
if (target !== 'postgres' && target !== 'sqlite') {
  console.error('Usage: node scripts/use-db.js <postgres|sqlite>')
  process.exit(1)
}

const backendDir = path.resolve(__dirname, '..', 'backend')
const schemaPath = path.join(backendDir, 'prisma', 'schema.prisma')
const envPath = path.join(backendDir, '.env')

const POSTGRES_URL =
  process.env.DT_POSTGRES_URL || 'postgresql://dt:dt@localhost:5432/digital_thread?schema=public'
const SQLITE_URL = 'file:./dev.db'

const provider = target === 'postgres' ? 'postgresql' : 'sqlite'
const dbProvider = target === 'postgres' ? 'postgres' : 'sqlite'
const dbUrl = target === 'postgres' ? POSTGRES_URL : SQLITE_URL

// ── schema.prisma — flip ONLY the datasource provider (sqlite|postgresql).
// `provider = "prisma-client-js"` on the generator is left untouched.
let schema = fs.readFileSync(schemaPath, 'utf8')
const before = schema
schema = schema.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${provider}"`)
if (schema === before && !schema.includes(`provider = "${provider}"`)) {
  console.error('Could not find a sqlite|postgresql datasource provider in schema.prisma')
  process.exit(1)
}
fs.writeFileSync(schemaPath, schema)

// ── .env — replace (or append) DATABASE_URL + DB_PROVIDER.
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
function setEnv(key, value) {
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(env)) env = env.replace(re, line)
  else env = (env.endsWith('\n') || env === '' ? env : env + '\n') + line + '\n'
}
setEnv('DB_PROVIDER', dbProvider)
setEnv('DATABASE_URL', dbUrl)
fs.writeFileSync(envPath, env)

// ── git — keep the local provider flip out of commits.
// The spec-kit git extension auto-commits with `git add .` after each phase, so
// a developer on SQLite would otherwise commit `provider = "sqlite"`. Marking
// schema.prisma as skip-worktree makes git ignore local changes to it while on
// SQLite; switching back to Postgres clears the flag. Schema changes are
// authored on Postgres anyway (see CONTRIBUTING.md, "Database changes").
function gitUpdateIndex(flag) {
  try {
    execFileSync('git', ['update-index', flag, 'prisma/schema.prisma'], { cwd: backendDir, stdio: 'ignore' })
    return true
  } catch {
    return false // not a git checkout, or git missing — nothing to protect
  }
}
const skipWorktreeChanged = gitUpdateIndex(target === 'sqlite' ? '--skip-worktree' : '--no-skip-worktree')

console.log(`DB switched → ${target}`)
console.log(`  schema.prisma datasource provider = "${provider}"`)
console.log(`  .env DATABASE_URL = ${dbUrl}`)
console.log(`  .env DB_PROVIDER  = ${dbProvider}`)
console.log('Next: prisma generate runs automatically (npm script), then create the schema:')
if (target === 'postgres') {
  console.log('  docker compose up -d postgres   # if not already running')
  console.log('  npm run db:migrate:deploy        # applies the committed migrations (schema + append-only triggers)')
  console.log('  npm run seed && npm run migrate:versions')
} else {
  console.log('  npm run db:setup:sqlite          # prisma db push + SQLite append-only triggers')
  console.log('  npm run seed && npm run migrate:versions')
  console.log('')
  console.log('NOTE: prisma/schema.prisma now has provider = "sqlite" in your working tree.')
  if (skipWorktreeChanged) {
    console.log('      git has been told to ignore local changes to that file (skip-worktree), so')
    console.log('      commits — including spec-kit auto-commits — cannot capture the flip.')
    console.log('      Author schema changes on Postgres: `npm run db:use:postgres` clears the flag.')
  } else {
    console.log('      Do not commit that change; run `npm run db:use:postgres` before committing.')
  }
}

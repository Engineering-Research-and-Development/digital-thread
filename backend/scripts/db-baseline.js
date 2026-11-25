#!/usr/bin/env node
/**
 * One-time baseline for PostgreSQL databases created BEFORE the migration
 * history existed (the former boot sequence ran `prisma db push` plus the
 * trigger SQL file on every start and never recorded migrations).
 *
 * Runs before `prisma migrate deploy`: the Docker image does it on every boot,
 * native installs run `npm run db:baseline`. Plain Node + the generated Prisma
 * client, so it works in the production image (no ts-node there).
 *
 * Decision table:
 *   DB_PROVIDER is not postgres                  -> nothing to do
 *   `_prisma_migrations` table exists            -> nothing to do (migrate deploy handles it)
 *   no application tables at all                 -> fresh database, migrate deploy creates it
 *   application tables, no migration history     -> legacy installation:
 *       1. `prisma db push` (WITHOUT --accept-data-loss) brings the schema to the
 *          current model exactly as the old boot sequence did; a change that
 *          would destroy data stops here and must be handled by an operator.
 *       2. re-apply the idempotent append-only trigger migration.
 *       3. record the baseline migrations as applied (`prisma migrate resolve`).
 *
 * Idempotent: after the first pass the history table exists and the script exits.
 */
const path = require('path')
const { execFileSync } = require('child_process')
const { PrismaClient } = require('@prisma/client')

const BACKEND_DIR = path.join(__dirname, '..')
const SCHEMA = path.join(BACKEND_DIR, 'prisma', 'schema.prisma')
const PRISMA_CLI = path.join(BACKEND_DIR, 'node_modules', 'prisma', 'build', 'index.js')
const BASELINE_MIGRATIONS = ['20261001120000_init', '20261001120100_append_only_triggers']
const TRIGGER_MIGRATION_FILE = path.join(
  BACKEND_DIR,
  'prisma',
  'migrations',
  '20261001120100_append_only_triggers',
  'migration.sql',
)

const log = (msg) => console.log(`[db-baseline] ${msg}`)

function prismaCli(args) {
  execFileSync(process.execPath, [PRISMA_CLI, ...args, '--schema', SCHEMA], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
  })
}

async function detectState() {
  const client = new PrismaClient()
  try {
    const rows = await client.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('_prisma_migrations', 'User')
    `
    const names = new Set(rows.map((r) => r.table_name))
    return {
      hasHistory: names.has('_prisma_migrations'),
      hasAppTables: names.has('User'),
    }
  } finally {
    await client.$disconnect()
  }
}

async function main() {
  const provider = (process.env.DB_PROVIDER ?? 'postgres').toLowerCase()
  if (provider !== 'postgres' && provider !== 'postgresql') {
    log(`DB_PROVIDER=${provider}: the baseline only applies to PostgreSQL, skipping.`)
    return
  }

  const { hasHistory, hasAppTables } = await detectState()
  if (hasHistory) {
    log('Migration history present, nothing to do.')
    return
  }
  if (!hasAppTables) {
    log('Empty database, prisma migrate deploy will create the schema.')
    return
  }

  log('Existing schema WITHOUT migration history detected (installation created with prisma db push).')
  log('1/3 Syncing the schema with prisma db push (no data loss accepted automatically) ...')
  prismaCli(['db', 'push', '--skip-generate'])
  log('2/3 Re-applying the append-only triggers (idempotent) ...')
  prismaCli(['db', 'execute', '--file', TRIGGER_MIGRATION_FILE])
  log('3/3 Recording the baseline migrations as applied ...')
  for (const name of BASELINE_MIGRATIONS) {
    prismaCli(['migrate', 'resolve', '--applied', name])
  }
  log('Done. From now on upgrades run through prisma migrate deploy.')
}

main().catch((err) => {
  console.error(`[db-baseline] Failed: ${err?.message ?? err}`)
  process.exit(1)
})

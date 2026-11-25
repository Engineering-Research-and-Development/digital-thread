-- Append-only / immutability triggers — SQLite dialect (developer setup only).
--
-- SQLite is the zero-dependency alternative for local development; PostgreSQL
-- is the production database and gets the same guarantees from the migration
-- prisma/migrations/20261001120100_append_only_triggers. Keep the two files in
-- sync: same tables, same blocked operations, same LoginAuditLog exception.
--
-- Idempotent: every trigger is DROP-IF-EXISTS first, so the file can be re-applied
-- after each `prisma db push`.
--
-- Apply with: npm run db:setup:sqlite   (prisma db push + this file)

-- ── AdminAuditLog — system audit log of all mutating requests ────────────────
DROP TRIGGER IF EXISTS "AdminAuditLog_no_update";
CREATE TRIGGER "AdminAuditLog_no_update"
BEFORE UPDATE ON "AdminAuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AdminAuditLog is append-only — corrections must be inserted as new rows');
END;

DROP TRIGGER IF EXISTS "AdminAuditLog_no_delete";
CREATE TRIGGER "AdminAuditLog_no_delete"
BEFORE DELETE ON "AdminAuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AdminAuditLog is append-only — rows cannot be deleted');
END;

-- ── AccessLog — read audit (VIEW/DOWNLOAD/EXPORT) ────────────────────────────
DROP TRIGGER IF EXISTS "AccessLog_no_update";
CREATE TRIGGER "AccessLog_no_update"
BEFORE UPDATE ON "AccessLog"
BEGIN
  SELECT RAISE(ABORT, 'AccessLog is append-only');
END;

DROP TRIGGER IF EXISTS "AccessLog_no_delete";
CREATE TRIGGER "AccessLog_no_delete"
BEFORE DELETE ON "AccessLog"
BEGIN
  SELECT RAISE(ABORT, 'AccessLog is append-only');
END;

-- ── LoginAuditLog — auth attempts ────────────────────────────────────────────
-- DELETE blocked outright. UPDATE allowed ONLY on the `email` column so the
-- GDPR pseudonymisation flow (retention/erasure.service.ts) can replace a
-- subject's email with an opaque pseudonym while keeping every other field frozen.
DROP TRIGGER IF EXISTS "LoginAuditLog_no_update";
CREATE TRIGGER "LoginAuditLog_no_update"
BEFORE UPDATE OF "id", "userId", "success", "ip", "userAgent", "reason", "timestamp" ON "LoginAuditLog"
BEGIN
  SELECT RAISE(ABORT, 'LoginAuditLog rows are append-only (only email may be pseudonymised under GDPR)');
END;

DROP TRIGGER IF EXISTS "LoginAuditLog_no_delete";
CREATE TRIGGER "LoginAuditLog_no_delete"
BEFORE DELETE ON "LoginAuditLog"
BEGIN
  SELECT RAISE(ABORT, 'LoginAuditLog is append-only');
END;

-- ── LineageEdge — file-to-file provenance graph ──────────────────────────────
-- UPDATE blocked (edges are frozen at insert; corrections add WAS_REVISION_OF rows).
-- DELETE intentionally NOT blocked: LineageEdge has ON DELETE CASCADE from
-- FileRecord, so erasing a file must be able to reap its orphan edges.
DROP TRIGGER IF EXISTS "LineageEdge_no_update";
CREATE TRIGGER "LineageEdge_no_update"
BEFORE UPDATE ON "LineageEdge"
BEGIN
  SELECT RAISE(ABORT, 'LineageEdge is append-only — corrections must be inserted as WAS_REVISION_OF rows');
END;

-- ── ProvenanceAgent — identity of WHO/WHAT performed an activity ─────────────
-- DELETE + UPDATE blocked: agents identified by (name, version) are immutable;
-- callers must use find-then-create, never upsert.
DROP TRIGGER IF EXISTS "ProvenanceAgent_no_update";
CREATE TRIGGER "ProvenanceAgent_no_update"
BEFORE UPDATE ON "ProvenanceAgent"
BEGIN
  SELECT RAISE(ABORT, 'ProvenanceAgent is append-only — agents identified by (name,version) cannot be updated');
END;

DROP TRIGGER IF EXISTS "ProvenanceAgent_no_delete";
CREATE TRIGGER "ProvenanceAgent_no_delete"
BEFORE DELETE ON "ProvenanceAgent"
BEGIN
  SELECT RAISE(ABORT, 'ProvenanceAgent is append-only');
END;

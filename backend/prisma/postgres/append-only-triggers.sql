-- Append-only / immutability triggers — PostgreSQL dialect.
--
-- Postgres equivalent of the SQLite triggers in
-- prisma/migrations/20260529103000_provenance_hardening/migration.sql.
-- SQLite uses `RAISE(ABORT, …)` inside a trigger body; Postgres needs a PL/pgSQL
-- function that `RAISE EXCEPTION`, attached via CREATE TRIGGER.
--
-- Idempotent: functions use CREATE OR REPLACE and every trigger is DROP-IF-EXISTS
-- first, so this file can be applied after `prisma db push` and re-applied on
-- every boot without error.
--
-- Apply with: prisma db execute --schema prisma/schema.prisma --file prisma/postgres/append-only-triggers.sql
-- (or `npm run db:triggers:postgres`).

-- ── Block functions ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dt_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only — corrections must be inserted as new rows', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dt_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only — rows cannot be deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- ── AdminAuditLog — system audit log of all mutating requests ────────────────
DROP TRIGGER IF EXISTS "AdminAuditLog_no_update" ON "AdminAuditLog";
CREATE TRIGGER "AdminAuditLog_no_update" BEFORE UPDATE ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION dt_block_update();
DROP TRIGGER IF EXISTS "AdminAuditLog_no_delete" ON "AdminAuditLog";
CREATE TRIGGER "AdminAuditLog_no_delete" BEFORE DELETE ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION dt_block_delete();

-- ── AccessLog — read audit (VIEW/DOWNLOAD/EXPORT) ────────────────────────────
DROP TRIGGER IF EXISTS "AccessLog_no_update" ON "AccessLog";
CREATE TRIGGER "AccessLog_no_update" BEFORE UPDATE ON "AccessLog"
  FOR EACH ROW EXECUTE FUNCTION dt_block_update();
DROP TRIGGER IF EXISTS "AccessLog_no_delete" ON "AccessLog";
CREATE TRIGGER "AccessLog_no_delete" BEFORE DELETE ON "AccessLog"
  FOR EACH ROW EXECUTE FUNCTION dt_block_delete();

-- ── LoginAuditLog — auth attempts ────────────────────────────────────────────
-- DELETE blocked outright. UPDATE blocked on every column EXCEPT `email`, so the
-- GDPR pseudonymisation flow (retention/erasure.service.ts) can replace a
-- subject's email with an opaque pseudonym while keeping every other field frozen.
DROP TRIGGER IF EXISTS "LoginAuditLog_no_update" ON "LoginAuditLog";
CREATE TRIGGER "LoginAuditLog_no_update"
  BEFORE UPDATE OF "id", "userId", "success", "ip", "userAgent", "reason", "timestamp" ON "LoginAuditLog"
  FOR EACH ROW EXECUTE FUNCTION dt_block_update();
DROP TRIGGER IF EXISTS "LoginAuditLog_no_delete" ON "LoginAuditLog";
CREATE TRIGGER "LoginAuditLog_no_delete" BEFORE DELETE ON "LoginAuditLog"
  FOR EACH ROW EXECUTE FUNCTION dt_block_delete();

-- ── LineageEdge — file-to-file provenance graph ──────────────────────────────
-- UPDATE blocked (edges are frozen at insert; corrections add WAS_REVISION_OF rows).
-- DELETE intentionally NOT blocked: LineageEdge has ON DELETE CASCADE from
-- FileRecord, so erasing a file must be able to reap its orphan edges.
DROP TRIGGER IF EXISTS "LineageEdge_no_update" ON "LineageEdge";
CREATE TRIGGER "LineageEdge_no_update" BEFORE UPDATE ON "LineageEdge"
  FOR EACH ROW EXECUTE FUNCTION dt_block_update();

-- ── ProvenanceAgent — identity of WHO/WHAT performed an activity ─────────────
-- DELETE + UPDATE blocked: agents identified by (name, version) are immutable;
-- callers must use find-then-create, never upsert.
DROP TRIGGER IF EXISTS "ProvenanceAgent_no_update" ON "ProvenanceAgent";
CREATE TRIGGER "ProvenanceAgent_no_update" BEFORE UPDATE ON "ProvenanceAgent"
  FOR EACH ROW EXECUTE FUNCTION dt_block_update();
DROP TRIGGER IF EXISTS "ProvenanceAgent_no_delete" ON "ProvenanceAgent";
CREATE TRIGGER "ProvenanceAgent_no_delete" BEFORE DELETE ON "ProvenanceAgent"
  FOR EACH ROW EXECUTE FUNCTION dt_block_delete();

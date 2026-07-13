-- Provenance hardening migration.
--
-- 1) Structured partner attribution on FileRecord.
-- 2) Human-readable transformationLabel on NodeRuntimeState.
-- 3) SQLite triggers enforcing append-only on the provenance + audit tables.

-- ── 1) FileRecord.partnerId ───────────────────────────────────────────────
ALTER TABLE "FileRecord" ADD COLUMN "partnerId" TEXT REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FileRecord_partnerId_idx" ON "FileRecord"("partnerId");

-- ── 2) NodeRuntimeState.transformationLabel ───────────────────────────────
ALTER TABLE "NodeRuntimeState" ADD COLUMN "transformationLabel" TEXT;

-- ── 3) Immutability triggers ──────────────────────────────────────────────
-- AdminAuditLog — system audit log of all mutating requests
CREATE TRIGGER "AdminAuditLog_no_update"
BEFORE UPDATE ON "AdminAuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AdminAuditLog is append-only — corrections must be inserted as new rows');
END;

CREATE TRIGGER "AdminAuditLog_no_delete"
BEFORE DELETE ON "AdminAuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AdminAuditLog is append-only — rows cannot be deleted');
END;

-- AccessLog — read audit (VIEW/DOWNLOAD/EXPORT)
CREATE TRIGGER "AccessLog_no_update"
BEFORE UPDATE ON "AccessLog"
BEGIN
  SELECT RAISE(ABORT, 'AccessLog is append-only');
END;

CREATE TRIGGER "AccessLog_no_delete"
BEFORE DELETE ON "AccessLog"
BEGIN
  SELECT RAISE(ABORT, 'AccessLog is append-only');
END;

-- LoginAuditLog — auth attempts.
-- DELETE blocked outright. UPDATE allowed ONLY on the `email` column so the
-- GDPR pseudonymisation flow (retention/erasure.service.ts) can replace a
-- subject's email with an opaque pseudonym while keeping every other audit
-- field frozen.
CREATE TRIGGER "LoginAuditLog_no_update"
BEFORE UPDATE OF "id", "userId", "success", "ip", "userAgent", "reason", "timestamp" ON "LoginAuditLog"
BEGIN
  SELECT RAISE(ABORT, 'LoginAuditLog rows are append-only (only email may be pseudonymised under GDPR)');
END;

CREATE TRIGGER "LoginAuditLog_no_delete"
BEFORE DELETE ON "LoginAuditLog"
BEGIN
  SELECT RAISE(ABORT, 'LoginAuditLog is append-only');
END;

-- LineageEdge — the file-to-file provenance graph; corrections add WAS_REVISION_OF rows.
-- UPDATE is blocked so an edge's metadata (relationType, transformInfo, endpoints) is
-- frozen at insert time. DELETE is intentionally NOT blocked because LineageEdge has
-- ON DELETE CASCADE from FileRecord: when an admin uses the retention/GDPR erasure
-- flow to remove a file, the orphan edges referencing it must be reaped.
CREATE TRIGGER "LineageEdge_no_update"
BEFORE UPDATE ON "LineageEdge"
BEGIN
  SELECT RAISE(ABORT, 'LineageEdge is append-only — corrections must be inserted as WAS_REVISION_OF rows');
END;

-- ProvenanceAgent — identity of WHO/WHAT performed an activity.
-- DELETE blocked. UPDATE blocked: handler/user/external agents are immutable by
-- (name, version, agentType); callers must use find-then-create, not upsert.
CREATE TRIGGER "ProvenanceAgent_no_update"
BEFORE UPDATE ON "ProvenanceAgent"
BEGIN
  SELECT RAISE(ABORT, 'ProvenanceAgent is append-only — agents identified by (name,version) cannot be updated');
END;

CREATE TRIGGER "ProvenanceAgent_no_delete"
BEFORE DELETE ON "ProvenanceAgent"
BEGIN
  SELECT RAISE(ABORT, 'ProvenanceAgent is append-only');
END;

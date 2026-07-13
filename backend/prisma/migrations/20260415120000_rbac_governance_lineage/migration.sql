-- Migration: RBAC redesign (SUPERADMIN/OWNER/PARTNER roles) plus the
-- provenance, lineage, enrichment, input-binding, ingestion, storage-manifest,
-- governance/audit, and change-management scaffolding tables.

-- ── User: account-lockout + role default change ────────────────────────────
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" DATETIME;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;

CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_partnerId_idx" ON "User"("partnerId");

-- ── RefreshToken indexes ───────────────────────────────────────────────────
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_revoked_idx" ON "RefreshToken"("userId", "revoked");

-- ── Partner: unique name + cert ────────────────────────────────────────────
CREATE UNIQUE INDEX "Partner_name_key" ON "Partner"("name");
ALTER TABLE "Partner" ADD COLUMN "certificatePem" TEXT;

-- ── DataSource: encryption flag + classification + owner partner ───────────
ALTER TABLE "DataSource" ADD COLUMN "authEncrypted" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "DataSource" ADD COLUMN "defaultClassification" TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "DataSource" ADD COLUMN "ownerPartnerId" TEXT REFERENCES "Partner"("id") ON DELETE SET NULL;

-- ── StateMachine: stable DTMI + indexes ────────────────────────────────────
ALTER TABLE "StateMachine" ADD COLUMN "dtmiBase" TEXT;
CREATE INDEX "StateMachine_name_version_idx" ON "StateMachine"("name", "version");

-- ── Iteration: classification + indexes ────────────────────────────────────
ALTER TABLE "Iteration" ADD COLUMN "classification" TEXT NOT NULL DEFAULT 'INTERNAL';
CREATE INDEX "Iteration_machineId_status_idx" ON "Iteration"("machineId", "status");
CREATE INDEX "Iteration_status_idx" ON "Iteration"("status");

-- ── NodeRuntimeState: provenance fields ────────────────────────────────────
ALTER TABLE "NodeRuntimeState" ADD COLUMN "handlerName" TEXT;
ALTER TABLE "NodeRuntimeState" ADD COLUMN "handlerVersion" TEXT;
ALTER TABLE "NodeRuntimeState" ADD COLUMN "executionParamsJson" TEXT;
ALTER TABLE "NodeRuntimeState" ADD COLUMN "provenanceAgentId" TEXT;
CREATE INDEX "NodeRuntimeState_iterationId_status_idx" ON "NodeRuntimeState"("iterationId", "status");

-- ── TimelineEvent indexes ──────────────────────────────────────────────────
CREATE INDEX "TimelineEvent_iterationId_timestamp_idx" ON "TimelineEvent"("iterationId", "timestamp");
CREATE INDEX "TimelineEvent_action_idx" ON "TimelineEvent"("action");

-- ── FileRecord: classification + pathKind + indexes ────────────────────────
ALTER TABLE "FileRecord" ADD COLUMN "classification" TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "FileRecord" ADD COLUMN "pathKind" TEXT NOT NULL DEFAULT 'nodes';
CREATE INDEX "FileRecord_iterationId_nodeSourceId_idx" ON "FileRecord"("iterationId", "nodeSourceId");
CREATE INDEX "FileRecord_contentHash_idx" ON "FileRecord"("contentHash");
CREATE INDEX "FileRecord_classification_idx" ON "FileRecord"("classification");

-- ── Provenance ─────────────────────────────────────────────────────────────
CREATE TABLE "ProvenanceAgent" (
  "id"          TEXT PRIMARY KEY,
  "agentType"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "version"     TEXT,
  "uri"         TEXT,
  "metadataJson" TEXT,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProvenanceAgent_name_version_key" ON "ProvenanceAgent"("name", "version");
CREATE INDEX "ProvenanceAgent_agentType_idx" ON "ProvenanceAgent"("agentType");

-- ── Lineage ────────────────────────────────────────────────────────────────
CREATE TABLE "LineageEdge" (
  "id"               TEXT PRIMARY KEY,
  "upstreamFileId"   TEXT NOT NULL REFERENCES "FileRecord"("id") ON DELETE CASCADE,
  "downstreamFileId" TEXT NOT NULL REFERENCES "FileRecord"("id") ON DELETE CASCADE,
  "relationType"     TEXT NOT NULL DEFAULT 'WAS_DERIVED_FROM',
  "transformInfo"    TEXT,
  "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "LineageEdge_unique_idx" ON "LineageEdge"("upstreamFileId","downstreamFileId","relationType");
CREATE INDEX "LineageEdge_upstream_idx" ON "LineageEdge"("upstreamFileId");
CREATE INDEX "LineageEdge_downstream_idx" ON "LineageEdge"("downstreamFileId");

-- ── Enrichment ─────────────────────────────────────────────────────────────
CREATE TABLE "EnrichmentRecord" (
  "id"              TEXT PRIMARY KEY,
  "fileId"          TEXT NOT NULL REFERENCES "FileRecord"("id") ON DELETE CASCADE,
  "enricherId"      TEXT NOT NULL,
  "enricherVersion" TEXT NOT NULL DEFAULT '1.0.0',
  "status"          TEXT NOT NULL DEFAULT 'OK',
  "resultJson"      TEXT,
  "errorMsg"        TEXT,
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "EnrichmentRecord_unique_idx" ON "EnrichmentRecord"("fileId","enricherId","enricherVersion");
CREATE INDEX "EnrichmentRecord_enricherId_idx" ON "EnrichmentRecord"("enricherId");

-- ── Input binding ──────────────────────────────────────────────────────────
CREATE TABLE "InputBinding" (
  "id"             TEXT PRIMARY KEY,
  "stateMachineId" TEXT NOT NULL REFERENCES "StateMachine"("id") ON DELETE CASCADE,
  "nodeId"         TEXT NOT NULL,
  "inputId"        TEXT NOT NULL,
  "bindingType"    TEXT NOT NULL,
  "dataSourceId"   TEXT REFERENCES "DataSource"("id") ON DELETE SET NULL,
  "configJson"     TEXT NOT NULL DEFAULT '{}',
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      DATETIME NOT NULL
);
CREATE UNIQUE INDEX "InputBinding_unique_idx" ON "InputBinding"("stateMachineId","nodeId","inputId");
CREATE INDEX "InputBinding_dataSourceId_idx" ON "InputBinding"("dataSourceId");

-- ── Ingestion record ───────────────────────────────────────────────────────
CREATE TABLE "IngestRecord" (
  "id"             TEXT PRIMARY KEY,
  "dataSourceId"   TEXT NOT NULL REFERENCES "DataSource"("id"),
  "iterationId"    TEXT REFERENCES "Iteration"("id"),
  "nodeId"         TEXT,
  "inputId"        TEXT,
  "status"         TEXT NOT NULL,
  "payloadHash"    TEXT,
  "bytesIngested"  INTEGER NOT NULL DEFAULT 0,
  "resolvedQuery"  TEXT,
  "errorMsg"       TEXT,
  "payloadPreview" TEXT,
  "receivedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IngestRecord_dataSourceId_status_idx" ON "IngestRecord"("dataSourceId","status");
CREATE INDEX "IngestRecord_receivedAt_idx" ON "IngestRecord"("receivedAt");
CREATE INDEX "IngestRecord_status_idx" ON "IngestRecord"("status");

-- ── Iteration MANIFEST ─────────────────────────────────────────────────────
CREATE TABLE "IterationManifest" (
  "id"              TEXT PRIMARY KEY,
  "iterationId"     TEXT NOT NULL REFERENCES "Iteration"("id") ON DELETE CASCADE,
  "manifestHash"    TEXT NOT NULL,
  "manifestPath"    TEXT NOT NULL,
  "signature"       TEXT,
  "signerPartnerId" TEXT,
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IterationManifest_iterationId_idx" ON "IterationManifest"("iterationId");

-- ── LoginAuditLog ──────────────────────────────────────────────────────────
CREATE TABLE "LoginAuditLog" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "email"     TEXT NOT NULL,
  "success"   BOOLEAN NOT NULL,
  "ip"        TEXT,
  "userAgent" TEXT,
  "reason"    TEXT,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LoginAuditLog_email_timestamp_idx" ON "LoginAuditLog"("email","timestamp");
CREATE INDEX "LoginAuditLog_userId_timestamp_idx" ON "LoginAuditLog"("userId","timestamp");

-- ── AdminAuditLog ──────────────────────────────────────────────────────────
CREATE TABLE "AdminAuditLog" (
  "id"          TEXT PRIMARY KEY,
  "actorUserId" TEXT NOT NULL REFERENCES "User"("id"),
  "action"      TEXT NOT NULL,
  "targetType"  TEXT NOT NULL,
  "targetId"    TEXT,
  "detail"      TEXT,
  "ip"          TEXT,
  "timestamp"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminAuditLog_actorUserId_timestamp_idx" ON "AdminAuditLog"("actorUserId","timestamp");
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType","targetId");

-- ── AccessLog (read audit) ─────────────────────────────────────────────────
CREATE TABLE "AccessLog" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL REFERENCES "User"("id"),
  "resourceType"   TEXT NOT NULL,
  "resourceId"     TEXT NOT NULL,
  "action"         TEXT NOT NULL,
  "classification" TEXT,
  "ip"             TEXT,
  "timestamp"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AccessLog_resourceType_resourceId_idx" ON "AccessLog"("resourceType","resourceId");
CREATE INDEX "AccessLog_userId_timestamp_idx" ON "AccessLog"("userId","timestamp");

-- ── ApprovalRequest + decisions ────────────────────────────────────────────
CREATE TABLE "ApprovalRequest" (
  "id"          TEXT PRIMARY KEY,
  "requesterId" TEXT NOT NULL REFERENCES "User"("id"),
  "action"      TEXT NOT NULL,
  "targetType"  TEXT NOT NULL,
  "targetId"    TEXT NOT NULL,
  "reason"      TEXT,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"  DATETIME
);
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status","createdAt");
CREATE INDEX "ApprovalRequest_targetType_targetId_idx" ON "ApprovalRequest"("targetType","targetId");

CREATE TABLE "ApprovalDecision" (
  "id"         TEXT PRIMARY KEY,
  "requestId"  TEXT NOT NULL REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE,
  "approverId" TEXT NOT NULL REFERENCES "User"("id"),
  "decision"   TEXT NOT NULL,
  "comment"    TEXT,
  "timestamp"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ApprovalDecision_unique_idx" ON "ApprovalDecision"("requestId","approverId");

-- ── ChangeRequest + NonConformance + FieldIssue ────────────────────────────
CREATE TABLE "ChangeRequest" (
  "id"          TEXT PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "targetType"  TEXT NOT NULL,
  "targetId"    TEXT NOT NULL,
  "raisedBy"    TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'OPEN',
  "impactJson"  TEXT,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   DATETIME NOT NULL
);
CREATE INDEX "ChangeRequest_targetType_targetId_idx" ON "ChangeRequest"("targetType","targetId");
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

CREATE TABLE "NonConformance" (
  "id"                TEXT PRIMARY KEY,
  "title"             TEXT NOT NULL,
  "description"       TEXT NOT NULL,
  "iterationId"       TEXT,
  "nodeId"            TEXT,
  "fileRecordId"      TEXT,
  "rootCauseCategory" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "rootCauseDetail"   TEXT,
  "severity"          TEXT NOT NULL DEFAULT 'MEDIUM',
  "status"            TEXT NOT NULL DEFAULT 'OPEN',
  "reportedBy"        TEXT NOT NULL,
  "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"        DATETIME
);
CREATE INDEX "NonConformance_status_severity_idx" ON "NonConformance"("status","severity");

CREATE TABLE "FieldIssue" (
  "id"                  TEXT PRIMARY KEY,
  "componentRef"        TEXT NOT NULL,
  "reporterId"          TEXT,
  "description"         TEXT NOT NULL,
  "severity"            TEXT NOT NULL DEFAULT 'MEDIUM',
  "capturedAt"          DATETIME NOT NULL,
  "linkedIterationId"   TEXT,
  "linkedFileRecordId"  TEXT,
  "status"              TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FieldIssue_componentRef_idx" ON "FieldIssue"("componentRef");
CREATE INDEX "FieldIssue_status_idx" ON "FieldIssue"("status");

-- ── Data migration: legacy roles → new RBAC ────────────────────────────────
UPDATE "User" SET "role" = 'SUPERADMIN' WHERE "role" = 'ADMIN';
UPDATE "User" SET "role" = 'OWNER'      WHERE "role" = 'PARTNER_ADMIN' AND "partnerId" IS NULL;
UPDATE "User" SET "role" = 'PARTNER'    WHERE "role" = 'PARTNER_ADMIN' AND "partnerId" IS NOT NULL;
UPDATE "User" SET "role" = 'PARTNER'    WHERE "role" = 'OPERATOR';
UPDATE "User" SET "role" = 'PARTNER'    WHERE "role" = 'VIEWER';

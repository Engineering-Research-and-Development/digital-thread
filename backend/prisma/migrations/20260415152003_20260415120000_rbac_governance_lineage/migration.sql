/*
  Warnings:

  - Made the column `id` on table `AccessLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `AdminAuditLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `ApprovalDecision` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `ApprovalRequest` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `ChangeRequest` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `EnrichmentRecord` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `FieldIssue` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `IngestRecord` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `InputBinding` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `IterationManifest` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `LineageEdge` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `LoginAuditLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `NonConformance` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `ProvenanceAgent` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "classification" TEXT,
    "ip" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AccessLog" ("action", "classification", "id", "ip", "resourceId", "resourceType", "timestamp", "userId") SELECT "action", "classification", "id", "ip", "resourceId", "resourceType", "timestamp", "userId" FROM "AccessLog";
DROP TABLE "AccessLog";
ALTER TABLE "new_AccessLog" RENAME TO "AccessLog";
CREATE INDEX "AccessLog_resourceType_resourceId_idx" ON "AccessLog"("resourceType", "resourceId");
CREATE INDEX "AccessLog_userId_timestamp_idx" ON "AccessLog"("userId", "timestamp");
CREATE TABLE "new_AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AdminAuditLog" ("action", "actorUserId", "detail", "id", "ip", "targetId", "targetType", "timestamp") SELECT "action", "actorUserId", "detail", "id", "ip", "targetId", "targetType", "timestamp" FROM "AdminAuditLog";
DROP TABLE "AdminAuditLog";
ALTER TABLE "new_AdminAuditLog" RENAME TO "AdminAuditLog";
CREATE INDEX "AdminAuditLog_actorUserId_timestamp_idx" ON "AdminAuditLog"("actorUserId", "timestamp");
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");
CREATE TABLE "new_ApprovalDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalDecision_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalDecision" ("approverId", "comment", "decision", "id", "requestId", "timestamp") SELECT "approverId", "comment", "decision", "id", "requestId", "timestamp" FROM "ApprovalDecision";
DROP TABLE "ApprovalDecision";
ALTER TABLE "new_ApprovalDecision" RENAME TO "ApprovalDecision";
CREATE UNIQUE INDEX "ApprovalDecision_requestId_approverId_key" ON "ApprovalDecision"("requestId", "approverId");
CREATE TABLE "new_ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalRequest" ("action", "createdAt", "id", "reason", "requesterId", "resolvedAt", "status", "targetId", "targetType") SELECT "action", "createdAt", "id", "reason", "requesterId", "resolvedAt", "status", "targetId", "targetType" FROM "ApprovalRequest";
DROP TABLE "ApprovalRequest";
ALTER TABLE "new_ApprovalRequest" RENAME TO "ApprovalRequest";
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");
CREATE INDEX "ApprovalRequest_targetType_targetId_idx" ON "ApprovalRequest"("targetType", "targetId");
CREATE TABLE "new_ChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "raisedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "impactJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ChangeRequest" ("createdAt", "description", "id", "impactJson", "raisedBy", "status", "targetId", "targetType", "title", "updatedAt") SELECT "createdAt", "description", "id", "impactJson", "raisedBy", "status", "targetId", "targetType", "title", "updatedAt" FROM "ChangeRequest";
DROP TABLE "ChangeRequest";
ALTER TABLE "new_ChangeRequest" RENAME TO "ChangeRequest";
CREATE INDEX "ChangeRequest_targetType_targetId_idx" ON "ChangeRequest"("targetType", "targetId");
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");
CREATE TABLE "new_DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "protocol" TEXT,
    "endpoint" TEXT NOT NULL,
    "description" TEXT,
    "authConfigJson" TEXT,
    "authEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "protocolConfigJson" TEXT,
    "pollIntervalMs" INTEGER,
    "accessMode" TEXT NOT NULL DEFAULT 'PULL',
    "tagMappingJson" TEXT,
    "defaultClassification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "ownerPartnerId" TEXT,
    "connectionStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" DATETIME,
    "lastErrorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DataSource_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DataSource" ("accessMode", "authConfigJson", "authEncrypted", "connectionStatus", "createdAt", "defaultClassification", "description", "endpoint", "id", "lastCheckedAt", "lastErrorMsg", "name", "ownerPartnerId", "pollIntervalMs", "protocol", "protocolConfigJson", "tagMappingJson", "type", "updatedAt") SELECT "accessMode", "authConfigJson", "authEncrypted", "connectionStatus", "createdAt", "defaultClassification", "description", "endpoint", "id", "lastCheckedAt", "lastErrorMsg", "name", "ownerPartnerId", "pollIntervalMs", "protocol", "protocolConfigJson", "tagMappingJson", "type", "updatedAt" FROM "DataSource";
DROP TABLE "DataSource";
ALTER TABLE "new_DataSource" RENAME TO "DataSource";
CREATE TABLE "new_EnrichmentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "enricherId" TEXT NOT NULL,
    "enricherVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'OK',
    "resultJson" TEXT,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnrichmentRecord_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EnrichmentRecord" ("createdAt", "enricherId", "enricherVersion", "errorMsg", "fileId", "id", "resultJson", "status") SELECT "createdAt", "enricherId", "enricherVersion", "errorMsg", "fileId", "id", "resultJson", "status" FROM "EnrichmentRecord";
DROP TABLE "EnrichmentRecord";
ALTER TABLE "new_EnrichmentRecord" RENAME TO "EnrichmentRecord";
CREATE INDEX "EnrichmentRecord_enricherId_idx" ON "EnrichmentRecord"("enricherId");
CREATE UNIQUE INDEX "EnrichmentRecord_fileId_enricherId_enricherVersion_key" ON "EnrichmentRecord"("fileId", "enricherId", "enricherVersion");
CREATE TABLE "new_FieldIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentRef" TEXT NOT NULL,
    "reporterId" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "capturedAt" DATETIME NOT NULL,
    "linkedIterationId" TEXT,
    "linkedFileRecordId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_FieldIssue" ("capturedAt", "componentRef", "createdAt", "description", "id", "linkedFileRecordId", "linkedIterationId", "reporterId", "severity", "status") SELECT "capturedAt", "componentRef", "createdAt", "description", "id", "linkedFileRecordId", "linkedIterationId", "reporterId", "severity", "status" FROM "FieldIssue";
DROP TABLE "FieldIssue";
ALTER TABLE "new_FieldIssue" RENAME TO "FieldIssue";
CREATE INDEX "FieldIssue_componentRef_idx" ON "FieldIssue"("componentRef");
CREATE INDEX "FieldIssue_status_idx" ON "FieldIssue"("status");
CREATE TABLE "new_IngestRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataSourceId" TEXT NOT NULL,
    "iterationId" TEXT,
    "nodeId" TEXT,
    "inputId" TEXT,
    "status" TEXT NOT NULL,
    "payloadHash" TEXT,
    "bytesIngested" INTEGER NOT NULL DEFAULT 0,
    "resolvedQuery" TEXT,
    "errorMsg" TEXT,
    "payloadPreview" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngestRecord_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IngestRecord_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IngestRecord" ("bytesIngested", "dataSourceId", "errorMsg", "id", "inputId", "iterationId", "nodeId", "payloadHash", "payloadPreview", "receivedAt", "resolvedQuery", "status") SELECT "bytesIngested", "dataSourceId", "errorMsg", "id", "inputId", "iterationId", "nodeId", "payloadHash", "payloadPreview", "receivedAt", "resolvedQuery", "status" FROM "IngestRecord";
DROP TABLE "IngestRecord";
ALTER TABLE "new_IngestRecord" RENAME TO "IngestRecord";
CREATE INDEX "IngestRecord_dataSourceId_status_idx" ON "IngestRecord"("dataSourceId", "status");
CREATE INDEX "IngestRecord_receivedAt_idx" ON "IngestRecord"("receivedAt");
CREATE INDEX "IngestRecord_status_idx" ON "IngestRecord"("status");
CREATE TABLE "new_InputBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateMachineId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "inputId" TEXT NOT NULL,
    "bindingType" TEXT NOT NULL,
    "dataSourceId" TEXT,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InputBinding_stateMachineId_fkey" FOREIGN KEY ("stateMachineId") REFERENCES "StateMachine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InputBinding_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InputBinding" ("bindingType", "configJson", "createdAt", "dataSourceId", "id", "inputId", "nodeId", "stateMachineId", "updatedAt") SELECT "bindingType", "configJson", "createdAt", "dataSourceId", "id", "inputId", "nodeId", "stateMachineId", "updatedAt" FROM "InputBinding";
DROP TABLE "InputBinding";
ALTER TABLE "new_InputBinding" RENAME TO "InputBinding";
CREATE INDEX "InputBinding_dataSourceId_idx" ON "InputBinding"("dataSourceId");
CREATE UNIQUE INDEX "InputBinding_stateMachineId_nodeId_inputId_key" ON "InputBinding"("stateMachineId", "nodeId", "inputId");
CREATE TABLE "new_IterationManifest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iterationId" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "manifestPath" TEXT NOT NULL,
    "signature" TEXT,
    "signerPartnerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IterationManifest_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IterationManifest" ("createdAt", "id", "iterationId", "manifestHash", "manifestPath", "signature", "signerPartnerId") SELECT "createdAt", "id", "iterationId", "manifestHash", "manifestPath", "signature", "signerPartnerId" FROM "IterationManifest";
DROP TABLE "IterationManifest";
ALTER TABLE "new_IterationManifest" RENAME TO "IterationManifest";
CREATE INDEX "IterationManifest_iterationId_idx" ON "IterationManifest"("iterationId");
CREATE TABLE "new_LineageEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upstreamFileId" TEXT NOT NULL,
    "downstreamFileId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'WAS_DERIVED_FROM',
    "transformInfo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LineageEdge_upstreamFileId_fkey" FOREIGN KEY ("upstreamFileId") REFERENCES "FileRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LineageEdge_downstreamFileId_fkey" FOREIGN KEY ("downstreamFileId") REFERENCES "FileRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LineageEdge" ("createdAt", "downstreamFileId", "id", "relationType", "transformInfo", "upstreamFileId") SELECT "createdAt", "downstreamFileId", "id", "relationType", "transformInfo", "upstreamFileId" FROM "LineageEdge";
DROP TABLE "LineageEdge";
ALTER TABLE "new_LineageEdge" RENAME TO "LineageEdge";
CREATE INDEX "LineageEdge_upstreamFileId_idx" ON "LineageEdge"("upstreamFileId");
CREATE INDEX "LineageEdge_downstreamFileId_idx" ON "LineageEdge"("downstreamFileId");
CREATE UNIQUE INDEX "LineageEdge_upstreamFileId_downstreamFileId_relationType_key" ON "LineageEdge"("upstreamFileId", "downstreamFileId", "relationType");
CREATE TABLE "new_LoginAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "reason" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LoginAuditLog" ("email", "id", "ip", "reason", "success", "timestamp", "userAgent", "userId") SELECT "email", "id", "ip", "reason", "success", "timestamp", "userAgent", "userId" FROM "LoginAuditLog";
DROP TABLE "LoginAuditLog";
ALTER TABLE "new_LoginAuditLog" RENAME TO "LoginAuditLog";
CREATE INDEX "LoginAuditLog_email_timestamp_idx" ON "LoginAuditLog"("email", "timestamp");
CREATE INDEX "LoginAuditLog_userId_timestamp_idx" ON "LoginAuditLog"("userId", "timestamp");
CREATE TABLE "new_NodeRuntimeState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iterationId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "logsJson" TEXT NOT NULL DEFAULT '[]',
    "outputFilePath" TEXT,
    "errorMessage" TEXT,
    "progress" REAL,
    "claimedBy" TEXT,
    "inputFileStatusesJson" TEXT,
    "handlerName" TEXT,
    "handlerVersion" TEXT,
    "executionParamsJson" TEXT,
    "provenanceAgentId" TEXT,
    CONSTRAINT "NodeRuntimeState_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NodeRuntimeState_provenanceAgentId_fkey" FOREIGN KEY ("provenanceAgentId") REFERENCES "ProvenanceAgent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NodeRuntimeState" ("claimedBy", "completedAt", "errorMessage", "executionParamsJson", "handlerName", "handlerVersion", "id", "inputFileStatusesJson", "iterationId", "logsJson", "nodeId", "outputFilePath", "progress", "provenanceAgentId", "startedAt", "status") SELECT "claimedBy", "completedAt", "errorMessage", "executionParamsJson", "handlerName", "handlerVersion", "id", "inputFileStatusesJson", "iterationId", "logsJson", "nodeId", "outputFilePath", "progress", "provenanceAgentId", "startedAt", "status" FROM "NodeRuntimeState";
DROP TABLE "NodeRuntimeState";
ALTER TABLE "new_NodeRuntimeState" RENAME TO "NodeRuntimeState";
CREATE INDEX "NodeRuntimeState_iterationId_status_idx" ON "NodeRuntimeState"("iterationId", "status");
CREATE UNIQUE INDEX "NodeRuntimeState_iterationId_nodeId_key" ON "NodeRuntimeState"("iterationId", "nodeId");
CREATE TABLE "new_NonConformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iterationId" TEXT,
    "nodeId" TEXT,
    "fileRecordId" TEXT,
    "rootCauseCategory" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "rootCauseDetail" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);
INSERT INTO "new_NonConformance" ("createdAt", "description", "fileRecordId", "id", "iterationId", "nodeId", "reportedBy", "resolvedAt", "rootCauseCategory", "rootCauseDetail", "severity", "status", "title") SELECT "createdAt", "description", "fileRecordId", "id", "iterationId", "nodeId", "reportedBy", "resolvedAt", "rootCauseCategory", "rootCauseDetail", "severity", "status", "title" FROM "NonConformance";
DROP TABLE "NonConformance";
ALTER TABLE "new_NonConformance" RENAME TO "NonConformance";
CREATE INDEX "NonConformance_status_severity_idx" ON "NonConformance"("status", "severity");
CREATE TABLE "new_ProvenanceAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "uri" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ProvenanceAgent" ("agentType", "createdAt", "id", "metadataJson", "name", "uri", "version") SELECT "agentType", "createdAt", "id", "metadataJson", "name", "uri", "version" FROM "ProvenanceAgent";
DROP TABLE "ProvenanceAgent";
ALTER TABLE "new_ProvenanceAgent" RENAME TO "ProvenanceAgent";
CREATE INDEX "ProvenanceAgent_agentType_idx" ON "ProvenanceAgent"("agentType");
CREATE UNIQUE INDEX "ProvenanceAgent_name_version_key" ON "ProvenanceAgent"("name", "version");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "fullName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PARTNER',
    "partnerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "failedLoginAttempts", "fullName", "hashedPassword", "id", "isActive", "lastLoginAt", "lockedUntil", "partnerId", "role", "updatedAt") SELECT "createdAt", "email", "failedLoginAttempts", "fullName", "hashedPassword", "id", "isActive", "lastLoginAt", "lockedUntil", "partnerId", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_partnerId_idx" ON "User"("partnerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

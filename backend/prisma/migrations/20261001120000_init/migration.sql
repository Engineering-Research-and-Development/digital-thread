-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "fullName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "partnerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'XX',
    "color" TEXT NOT NULL,
    "role" TEXT,
    "certificatePem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "urn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerPartnerId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
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
    "lastCheckedAt" TIMESTAMP(3),
    "lastErrorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TASK',
    "icon" TEXT NOT NULL DEFAULT 'Box',
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "description" TEXT NOT NULL,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "defaultPartnerId" TEXT,
    "inputsJson" TEXT NOT NULL DEFAULT '[]',
    "outputsJson" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateMachine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "dtmiBase" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "nodesJson" TEXT NOT NULL DEFAULT '[]',
    "edgesJson" TEXT NOT NULL DEFAULT '[]',
    "groupsJson" TEXT NOT NULL DEFAULT '[]',
    "aasShellJson" TEXT,
    "latestVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StateMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateMachineVersion" (
    "id" TEXT NOT NULL,
    "stateMachineId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "nodesJson" TEXT NOT NULL,
    "edgesJson" TEXT NOT NULL,
    "groupsJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StateMachineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Iteration" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "machineName" TEXT NOT NULL,
    "stateMachineVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerPartnerId" TEXT,
    "productId" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "parentIterationId" TEXT,
    "restartFromNodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Iteration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeRuntimeState" (
    "id" TEXT NOT NULL,
    "iterationId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "logsJson" TEXT NOT NULL DEFAULT '[]',
    "outputsJson" TEXT,
    "outputFilePath" TEXT,
    "errorMessage" TEXT,
    "progress" DOUBLE PRECISION,
    "claimedBy" TEXT,
    "inputFileStatusesJson" TEXT,
    "handlerName" TEXT,
    "handlerVersion" TEXT,
    "executionParamsJson" TEXT,
    "provenanceAgentId" TEXT,
    "transformationLabel" TEXT,

    CONSTRAINT "NodeRuntimeState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "iterationId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeLabel" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "filePath" TEXT,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileRecord" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "nodeSourceId" TEXT,
    "nodeSourceLabel" TEXT,
    "nodeOutputId" TEXT,
    "iterationId" TEXT,
    "attachmentKind" TEXT NOT NULL DEFAULT 'NODE',
    "uploadType" TEXT NOT NULL,
    "sourceInfo" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "pathKind" TEXT NOT NULL DEFAULT 'nodes',
    "partnerId" TEXT,

    CONSTRAINT "FileRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvenanceAgent" (
    "id" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "uri" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvenanceAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineageEdge" (
    "id" TEXT NOT NULL,
    "upstreamFileId" TEXT NOT NULL,
    "downstreamFileId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'WAS_DERIVED_FROM',
    "transformInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineageEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentRecord" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "enricherId" TEXT NOT NULL,
    "enricherVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'OK',
    "resultJson" TEXT,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputBinding" (
    "id" TEXT NOT NULL,
    "stateMachineId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "inputId" TEXT NOT NULL,
    "bindingType" TEXT NOT NULL,
    "dataSourceId" TEXT,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InputBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRecord" (
    "id" TEXT NOT NULL,
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
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IterationManifest" (
    "id" TEXT NOT NULL,
    "iterationId" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "manifestPath" TEXT NOT NULL,
    "signature" TEXT,
    "signerPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IterationManifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "classification" TEXT,
    "ip" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAccessRequest" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "iterationId" TEXT,
    "requesterId" TEXT NOT NULL,
    "requesterPartnerId" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "grantExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "raisedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "impactJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonConformance" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "NonConformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT,
    "kind" TEXT NOT NULL,
    "eventTypes" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "secret" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'NONE',
    "authConfigJson" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventKey" TEXT,
    "summary" TEXT,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "errorMsg" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataExport" (
    "id" TEXT NOT NULL,
    "iterationId" TEXT,
    "targetPartnerId" TEXT,
    "manifestId" TEXT,
    "policyJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transmittedAt" TIMESTAMP(3),

    CONSTRAINT "DataExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImport" (
    "id" TEXT NOT NULL,
    "sourcePartner" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "policyJson" TEXT,
    "signature" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifyReason" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AasRegistryPeer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registryUrl" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AasRegistryPeer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AasRegistryShell" (
    "id" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "shellId" TEXT NOT NULL,
    "descriptorJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AasRegistryShell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldIssue" (
    "id" TEXT NOT NULL,
    "componentRef" TEXT NOT NULL,
    "reporterId" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "linkedIterationId" TEXT,
    "linkedFileRecordId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_partnerId_idx" ON "User"("partnerId");

-- CreateIndex
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revoked_idx" ON "RefreshToken"("userId", "revoked");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_name_key" ON "Partner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_urn_key" ON "Product"("urn");

-- CreateIndex
CREATE INDEX "Product_ownerPartnerId_idx" ON "Product"("ownerPartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeTemplate_slug_key" ON "NodeTemplate"("slug");

-- CreateIndex
CREATE INDEX "NodeTemplate_enabled_sortOrder_idx" ON "NodeTemplate"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "StateMachine_name_version_idx" ON "StateMachine"("name", "version");

-- CreateIndex
CREATE INDEX "StateMachineVersion_stateMachineId_createdAt_idx" ON "StateMachineVersion"("stateMachineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StateMachineVersion_stateMachineId_versionNumber_key" ON "StateMachineVersion"("stateMachineId", "versionNumber");

-- CreateIndex
CREATE INDEX "Iteration_machineId_status_idx" ON "Iteration"("machineId", "status");

-- CreateIndex
CREATE INDEX "Iteration_status_idx" ON "Iteration"("status");

-- CreateIndex
CREATE INDEX "Iteration_ownerPartnerId_idx" ON "Iteration"("ownerPartnerId");

-- CreateIndex
CREATE INDEX "Iteration_productId_idx" ON "Iteration"("productId");

-- CreateIndex
CREATE INDEX "NodeRuntimeState_iterationId_status_idx" ON "NodeRuntimeState"("iterationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NodeRuntimeState_iterationId_nodeId_key" ON "NodeRuntimeState"("iterationId", "nodeId");

-- CreateIndex
CREATE INDEX "TimelineEvent_iterationId_timestamp_idx" ON "TimelineEvent"("iterationId", "timestamp");

-- CreateIndex
CREATE INDEX "TimelineEvent_action_idx" ON "TimelineEvent"("action");

-- CreateIndex
CREATE UNIQUE INDEX "FileRecord_path_key" ON "FileRecord"("path");

-- CreateIndex
CREATE INDEX "FileRecord_iterationId_nodeSourceId_idx" ON "FileRecord"("iterationId", "nodeSourceId");

-- CreateIndex
CREATE INDEX "FileRecord_contentHash_idx" ON "FileRecord"("contentHash");

-- CreateIndex
CREATE INDEX "FileRecord_classification_idx" ON "FileRecord"("classification");

-- CreateIndex
CREATE INDEX "FileRecord_partnerId_idx" ON "FileRecord"("partnerId");

-- CreateIndex
CREATE INDEX "FileRecord_attachmentKind_idx" ON "FileRecord"("attachmentKind");

-- CreateIndex
CREATE INDEX "ProvenanceAgent_agentType_idx" ON "ProvenanceAgent"("agentType");

-- CreateIndex
CREATE UNIQUE INDEX "ProvenanceAgent_name_version_key" ON "ProvenanceAgent"("name", "version");

-- CreateIndex
CREATE INDEX "LineageEdge_upstreamFileId_idx" ON "LineageEdge"("upstreamFileId");

-- CreateIndex
CREATE INDEX "LineageEdge_downstreamFileId_idx" ON "LineageEdge"("downstreamFileId");

-- CreateIndex
CREATE UNIQUE INDEX "LineageEdge_upstreamFileId_downstreamFileId_relationType_key" ON "LineageEdge"("upstreamFileId", "downstreamFileId", "relationType");

-- CreateIndex
CREATE INDEX "EnrichmentRecord_enricherId_idx" ON "EnrichmentRecord"("enricherId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrichmentRecord_fileId_enricherId_enricherVersion_key" ON "EnrichmentRecord"("fileId", "enricherId", "enricherVersion");

-- CreateIndex
CREATE INDEX "InputBinding_dataSourceId_idx" ON "InputBinding"("dataSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "InputBinding_stateMachineId_nodeId_inputId_key" ON "InputBinding"("stateMachineId", "nodeId", "inputId");

-- CreateIndex
CREATE INDEX "IngestRecord_dataSourceId_status_idx" ON "IngestRecord"("dataSourceId", "status");

-- CreateIndex
CREATE INDEX "IngestRecord_receivedAt_idx" ON "IngestRecord"("receivedAt");

-- CreateIndex
CREATE INDEX "IngestRecord_status_idx" ON "IngestRecord"("status");

-- CreateIndex
CREATE INDEX "IterationManifest_iterationId_idx" ON "IterationManifest"("iterationId");

-- CreateIndex
CREATE INDEX "LoginAuditLog_email_timestamp_idx" ON "LoginAuditLog"("email", "timestamp");

-- CreateIndex
CREATE INDEX "LoginAuditLog_userId_timestamp_idx" ON "LoginAuditLog"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_timestamp_idx" ON "AdminAuditLog"("actorUserId", "timestamp");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorRole_timestamp_idx" ON "AdminAuditLog"("actorRole", "timestamp");

-- CreateIndex
CREATE INDEX "AccessLog_resourceType_resourceId_idx" ON "AccessLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AccessLog_userId_timestamp_idx" ON "AccessLog"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_targetType_targetId_idx" ON "ApprovalRequest"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalDecision_requestId_approverId_key" ON "ApprovalDecision"("requestId", "approverId");

-- CreateIndex
CREATE INDEX "FileAccessRequest_status_createdAt_idx" ON "FileAccessRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FileAccessRequest_fileId_requesterId_status_idx" ON "FileAccessRequest"("fileId", "requesterId", "status");

-- CreateIndex
CREATE INDEX "FileAccessRequest_requesterId_status_idx" ON "FileAccessRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "ChangeRequest_targetType_targetId_idx" ON "ChangeRequest"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE INDEX "NonConformance_status_severity_idx" ON "NonConformance"("status", "severity");

-- CreateIndex
CREATE INDEX "NotificationSubscription_kind_enabled_idx" ON "NotificationSubscription"("kind", "enabled");

-- CreateIndex
CREATE INDEX "NotificationSubscription_userId_idx" ON "NotificationSubscription"("userId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_subscriptionId_sentAt_idx" ON "NotificationDelivery"("subscriptionId", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_recipientUserId_sentAt_idx" ON "NotificationDelivery"("recipientUserId", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_userId_key" ON "ApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_key_key" ON "AppConfig"("key");

-- CreateIndex
CREATE INDEX "DataExport_status_idx" ON "DataExport"("status");

-- CreateIndex
CREATE INDEX "DataExport_manifestId_idx" ON "DataExport"("manifestId");

-- CreateIndex
CREATE INDEX "DataImport_verified_idx" ON "DataImport"("verified");

-- CreateIndex
CREATE UNIQUE INDEX "AasRegistryShell_peerId_shellId_key" ON "AasRegistryShell"("peerId", "shellId");

-- CreateIndex
CREATE INDEX "FieldIssue_componentRef_idx" ON "FieldIssue"("componentRef");

-- CreateIndex
CREATE INDEX "FieldIssue_status_idx" ON "FieldIssue"("status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StateMachineVersion" ADD CONSTRAINT "StateMachineVersion_stateMachineId_fkey" FOREIGN KEY ("stateMachineId") REFERENCES "StateMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iteration" ADD CONSTRAINT "Iteration_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "StateMachine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iteration" ADD CONSTRAINT "Iteration_stateMachineVersionId_fkey" FOREIGN KEY ("stateMachineVersionId") REFERENCES "StateMachineVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iteration" ADD CONSTRAINT "Iteration_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Iteration" ADD CONSTRAINT "Iteration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeRuntimeState" ADD CONSTRAINT "NodeRuntimeState_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeRuntimeState" ADD CONSTRAINT "NodeRuntimeState_provenanceAgentId_fkey" FOREIGN KEY ("provenanceAgentId") REFERENCES "ProvenanceAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRecord" ADD CONSTRAINT "FileRecord_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileRecord" ADD CONSTRAINT "FileRecord_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineageEdge" ADD CONSTRAINT "LineageEdge_upstreamFileId_fkey" FOREIGN KEY ("upstreamFileId") REFERENCES "FileRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineageEdge" ADD CONSTRAINT "LineageEdge_downstreamFileId_fkey" FOREIGN KEY ("downstreamFileId") REFERENCES "FileRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRecord" ADD CONSTRAINT "EnrichmentRecord_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputBinding" ADD CONSTRAINT "InputBinding_stateMachineId_fkey" FOREIGN KEY ("stateMachineId") REFERENCES "StateMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputBinding" ADD CONSTRAINT "InputBinding_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestRecord" ADD CONSTRAINT "IngestRecord_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestRecord" ADD CONSTRAINT "IngestRecord_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IterationManifest" ADD CONSTRAINT "IterationManifest_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginAuditLog" ADD CONSTRAINT "LoginAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAccessRequest" ADD CONSTRAINT "FileAccessRequest_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAccessRequest" ADD CONSTRAINT "FileAccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAccessRequest" ADD CONSTRAINT "FileAccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubscription" ADD CONSTRAINT "NotificationSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotificationSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_targetPartnerId_fkey" FOREIGN KEY ("targetPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "IterationManifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AasRegistryShell" ADD CONSTRAINT "AasRegistryShell_peerId_fkey" FOREIGN KEY ("peerId") REFERENCES "AasRegistryPeer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "urn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerPartnerId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FileRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT,
    "timestamp" DATETIME NOT NULL,
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
    CONSTRAINT "FileRecord_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FileRecord_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FileRecord" ("bucket", "classification", "contentHash", "contentType", "filename", "id", "iterationId", "nodeOutputId", "nodeSourceId", "nodeSourceLabel", "partnerId", "path", "pathKind", "sizeBytes", "sourceInfo", "timestamp", "uploadType", "version") SELECT "bucket", "classification", "contentHash", "contentType", "filename", "id", "iterationId", "nodeOutputId", "nodeSourceId", "nodeSourceLabel", "partnerId", "path", "pathKind", "sizeBytes", "sourceInfo", "timestamp", "uploadType", "version" FROM "FileRecord";
DROP TABLE "FileRecord";
ALTER TABLE "new_FileRecord" RENAME TO "FileRecord";
CREATE UNIQUE INDEX "FileRecord_path_key" ON "FileRecord"("path");
CREATE INDEX "FileRecord_iterationId_nodeSourceId_idx" ON "FileRecord"("iterationId", "nodeSourceId");
CREATE INDEX "FileRecord_contentHash_idx" ON "FileRecord"("contentHash");
CREATE INDEX "FileRecord_classification_idx" ON "FileRecord"("classification");
CREATE INDEX "FileRecord_partnerId_idx" ON "FileRecord"("partnerId");
CREATE INDEX "FileRecord_attachmentKind_idx" ON "FileRecord"("attachmentKind");
CREATE TABLE "new_Iteration" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Iteration_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "StateMachine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Iteration_stateMachineVersionId_fkey" FOREIGN KEY ("stateMachineVersionId") REFERENCES "StateMachineVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Iteration_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Iteration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Iteration" ("classification", "completedAt", "createdAt", "displayId", "id", "machineId", "machineName", "metadataJson", "parentIterationId", "restartFromNodeId", "stateMachineVersionId", "status") SELECT "classification", "completedAt", "createdAt", "displayId", "id", "machineId", "machineName", "metadataJson", "parentIterationId", "restartFromNodeId", "stateMachineVersionId", "status" FROM "Iteration";
DROP TABLE "Iteration";
ALTER TABLE "new_Iteration" RENAME TO "Iteration";
CREATE INDEX "Iteration_machineId_status_idx" ON "Iteration"("machineId", "status");
CREATE INDEX "Iteration_status_idx" ON "Iteration"("status");
CREATE INDEX "Iteration_ownerPartnerId_idx" ON "Iteration"("ownerPartnerId");
CREATE INDEX "Iteration_productId_idx" ON "Iteration"("productId");
CREATE TABLE "new_Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'XX',
    "color" TEXT NOT NULL,
    "role" TEXT,
    "certificatePem" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Partner" ("certificatePem", "color", "createdAt", "fullName", "id", "name", "role", "updatedAt") SELECT "certificatePem", "color", "createdAt", "fullName", "id", "name", "role", "updatedAt" FROM "Partner";
DROP TABLE "Partner";
ALTER TABLE "new_Partner" RENAME TO "Partner";
CREATE UNIQUE INDEX "Partner_name_key" ON "Partner"("name");
CREATE TABLE "new_StateMachine" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StateMachine" ("aasShellJson", "createdAt", "createdById", "description", "dtmiBase", "edgesJson", "id", "latestVersion", "name", "nodesJson", "tags", "updatedAt", "version") SELECT "aasShellJson", "createdAt", "createdById", "description", "dtmiBase", "edgesJson", "id", "latestVersion", "name", "nodesJson", "tags", "updatedAt", "version" FROM "StateMachine";
DROP TABLE "StateMachine";
ALTER TABLE "new_StateMachine" RENAME TO "StateMachine";
CREATE INDEX "StateMachine_name_version_idx" ON "StateMachine"("name", "version");
CREATE TABLE "new_StateMachineVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateMachineId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "nodesJson" TEXT NOT NULL,
    "edgesJson" TEXT NOT NULL,
    "groupsJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StateMachineVersion_stateMachineId_fkey" FOREIGN KEY ("stateMachineId") REFERENCES "StateMachine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StateMachineVersion" ("createdAt", "createdById", "edgesJson", "id", "nodesJson", "stateMachineId", "versionLabel", "versionNumber") SELECT "createdAt", "createdById", "edgesJson", "id", "nodesJson", "stateMachineId", "versionLabel", "versionNumber" FROM "StateMachineVersion";
DROP TABLE "StateMachineVersion";
ALTER TABLE "new_StateMachineVersion" RENAME TO "StateMachineVersion";
CREATE INDEX "StateMachineVersion_stateMachineId_createdAt_idx" ON "StateMachineVersion"("stateMachineId", "createdAt");
CREATE UNIQUE INDEX "StateMachineVersion_stateMachineId_versionNumber_key" ON "StateMachineVersion"("stateMachineId", "versionNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Product_urn_key" ON "Product"("urn");

-- CreateIndex
CREATE INDEX "Product_ownerPartnerId_idx" ON "Product"("ownerPartnerId");

-- CreateTable
CREATE TABLE "StateMachineVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateMachineId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "nodesJson" TEXT NOT NULL,
    "edgesJson" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StateMachineVersion_stateMachineId_fkey" FOREIGN KEY ("stateMachineId") REFERENCES "StateMachine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Iteration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "machineName" TEXT NOT NULL,
    "stateMachineVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "parentIterationId" TEXT,
    "restartFromNodeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Iteration_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "StateMachine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Iteration_stateMachineVersionId_fkey" FOREIGN KEY ("stateMachineVersionId") REFERENCES "StateMachineVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Iteration" ("classification", "completedAt", "createdAt", "displayId", "id", "machineId", "machineName", "metadataJson", "parentIterationId", "restartFromNodeId", "status") SELECT "classification", "completedAt", "createdAt", "displayId", "id", "machineId", "machineName", "metadataJson", "parentIterationId", "restartFromNodeId", "status" FROM "Iteration";
DROP TABLE "Iteration";
ALTER TABLE "new_Iteration" RENAME TO "Iteration";
CREATE INDEX "Iteration_machineId_status_idx" ON "Iteration"("machineId", "status");
CREATE INDEX "Iteration_status_idx" ON "Iteration"("status");
CREATE TABLE "new_StateMachine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "dtmiBase" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "nodesJson" TEXT NOT NULL DEFAULT '[]',
    "edgesJson" TEXT NOT NULL DEFAULT '[]',
    "aasShellJson" TEXT,
    "latestVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StateMachine" ("aasShellJson", "createdAt", "createdById", "description", "dtmiBase", "edgesJson", "id", "name", "nodesJson", "tags", "updatedAt", "version") SELECT "aasShellJson", "createdAt", "createdById", "description", "dtmiBase", "edgesJson", "id", "name", "nodesJson", "tags", "updatedAt", "version" FROM "StateMachine";
DROP TABLE "StateMachine";
ALTER TABLE "new_StateMachine" RENAME TO "StateMachine";
CREATE INDEX "StateMachine_name_version_idx" ON "StateMachine"("name", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StateMachineVersion_stateMachineId_createdAt_idx" ON "StateMachineVersion"("stateMachineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StateMachineVersion_stateMachineId_versionNumber_key" ON "StateMachineVersion"("stateMachineId", "versionNumber");

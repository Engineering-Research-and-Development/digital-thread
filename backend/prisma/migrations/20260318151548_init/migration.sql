-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "fullName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "partnerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "protocol" TEXT,
    "endpoint" TEXT NOT NULL,
    "description" TEXT,
    "authConfigJson" TEXT,
    "protocolConfigJson" TEXT,
    "pollIntervalMs" INTEGER,
    "accessMode" TEXT NOT NULL DEFAULT 'PULL',
    "tagMappingJson" TEXT,
    "connectionStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" DATETIME,
    "lastErrorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StateMachine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "nodesJson" TEXT NOT NULL DEFAULT '[]',
    "edgesJson" TEXT NOT NULL DEFAULT '[]',
    "aasShellJson" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Iteration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "machineName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "parentIterationId" TEXT,
    "restartFromNodeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Iteration_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "StateMachine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NodeRuntimeState" (
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
    CONSTRAINT "NodeRuntimeState_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iterationId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeLabel" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "filePath" TEXT,
    CONSTRAINT "TimelineEvent_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FileRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT,
    "timestamp" DATETIME NOT NULL,
    "nodeSourceId" TEXT NOT NULL,
    "nodeSourceLabel" TEXT NOT NULL,
    "iterationId" TEXT NOT NULL,
    "uploadType" TEXT NOT NULL,
    "sourceInfo" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    CONSTRAINT "FileRecord_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NodeRuntimeState_iterationId_nodeId_key" ON "NodeRuntimeState"("iterationId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "FileRecord_path_key" ON "FileRecord"("path");

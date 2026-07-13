-- CreateTable
CREATE TABLE "FileAccessRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterPartnerId" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" DATETIME,
    "grantExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileAccessRequest_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FileAccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FileAccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FileAccessRequest_status_createdAt_idx" ON "FileAccessRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FileAccessRequest_fileId_requesterId_status_idx" ON "FileAccessRequest"("fileId", "requesterId", "status");

-- CreateIndex
CREATE INDEX "FileAccessRequest_requesterId_status_idx" ON "FileAccessRequest"("requesterId", "status");

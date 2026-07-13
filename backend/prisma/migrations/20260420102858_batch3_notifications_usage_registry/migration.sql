/*
  Warnings:

  - Made the column `id` on table `AasRegistryPeer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `AasRegistryShell` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `DataExport` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `DataImport` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `NotificationDelivery` required. This step will fail if there are existing NULL values in that column.
  - Made the column `id` on table `NotificationSubscription` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AasRegistryPeer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "registryUrl" TEXT NOT NULL,
    "lastSyncAt" DATETIME,
    "lastError" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AasRegistryPeer" ("createdAt", "enabled", "id", "lastError", "lastSyncAt", "name", "registryUrl") SELECT "createdAt", "enabled", "id", "lastError", "lastSyncAt", "name", "registryUrl" FROM "AasRegistryPeer";
DROP TABLE "AasRegistryPeer";
ALTER TABLE "new_AasRegistryPeer" RENAME TO "AasRegistryPeer";
CREATE TABLE "new_AasRegistryShell" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "peerId" TEXT NOT NULL,
    "shellId" TEXT NOT NULL,
    "descriptorJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AasRegistryShell_peerId_fkey" FOREIGN KEY ("peerId") REFERENCES "AasRegistryPeer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AasRegistryShell" ("descriptorJson", "id", "peerId", "shellId", "updatedAt") SELECT "descriptorJson", "id", "peerId", "shellId", "updatedAt" FROM "AasRegistryShell";
DROP TABLE "AasRegistryShell";
ALTER TABLE "new_AasRegistryShell" RENAME TO "AasRegistryShell";
CREATE UNIQUE INDEX "AasRegistryShell_peerId_shellId_key" ON "AasRegistryShell"("peerId", "shellId");
CREATE TABLE "new_DataExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iterationId" TEXT,
    "targetPartnerId" TEXT,
    "manifestId" TEXT,
    "policyJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transmittedAt" DATETIME,
    CONSTRAINT "DataExport_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DataExport_targetPartnerId_fkey" FOREIGN KEY ("targetPartnerId") REFERENCES "Partner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DataExport_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "IterationManifest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DataExport" ("createdAt", "createdById", "id", "iterationId", "manifestId", "policyJson", "status", "targetPartnerId", "transmittedAt") SELECT "createdAt", "createdById", "id", "iterationId", "manifestId", "policyJson", "status", "targetPartnerId", "transmittedAt" FROM "DataExport";
DROP TABLE "DataExport";
ALTER TABLE "new_DataExport" RENAME TO "DataExport";
CREATE INDEX "DataExport_status_idx" ON "DataExport"("status");
CREATE INDEX "DataExport_manifestId_idx" ON "DataExport"("manifestId");
CREATE TABLE "new_DataImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourcePartner" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "policyJson" TEXT,
    "signature" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifyReason" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" DATETIME,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_DataImport" ("acceptedAt", "acceptedById", "id", "manifestHash", "manifestJson", "policyJson", "receivedAt", "signature", "sourcePartner", "verified", "verifyReason") SELECT "acceptedAt", "acceptedById", "id", "manifestHash", "manifestJson", "policyJson", "receivedAt", "signature", "sourcePartner", "verified", "verifyReason" FROM "DataImport";
DROP TABLE "DataImport";
ALTER TABLE "new_DataImport" RENAME TO "DataImport";
CREATE INDEX "DataImport_verified_idx" ON "DataImport"("verified");
CREATE TABLE "new_NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "errorMsg" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotificationSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationDelivery" ("attempt", "errorMsg", "eventType", "httpStatus", "id", "payloadJson", "sentAt", "status", "subscriptionId") SELECT "attempt", "errorMsg", "eventType", "httpStatus", "id", "payloadJson", "sentAt", "status", "subscriptionId" FROM "NotificationDelivery";
DROP TABLE "NotificationDelivery";
ALTER TABLE "new_NotificationDelivery" RENAME TO "NotificationDelivery";
CREATE INDEX "NotificationDelivery_subscriptionId_sentAt_idx" ON "NotificationDelivery"("subscriptionId", "sentAt");
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");
CREATE TABLE "new_NotificationSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "eventTypes" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NotificationSubscription" ("createdAt", "enabled", "eventTypes", "id", "kind", "secret", "target", "updatedAt") SELECT "createdAt", "enabled", "eventTypes", "id", "kind", "secret", "target", "updatedAt" FROM "NotificationSubscription";
DROP TABLE "NotificationSubscription";
ALTER TABLE "new_NotificationSubscription" RENAME TO "NotificationSubscription";
CREATE INDEX "NotificationSubscription_kind_enabled_idx" ON "NotificationSubscription"("kind", "enabled");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

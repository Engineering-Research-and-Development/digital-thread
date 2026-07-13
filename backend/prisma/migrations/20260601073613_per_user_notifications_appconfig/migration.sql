-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotificationSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationDelivery_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NotificationDelivery" ("attempt", "errorMsg", "eventType", "httpStatus", "id", "payloadJson", "sentAt", "status", "subscriptionId") SELECT "attempt", "errorMsg", "eventType", "httpStatus", "id", "payloadJson", "sentAt", "status", "subscriptionId" FROM "NotificationDelivery";
DROP TABLE "NotificationDelivery";
ALTER TABLE "new_NotificationDelivery" RENAME TO "NotificationDelivery";
CREATE INDEX "NotificationDelivery_subscriptionId_sentAt_idx" ON "NotificationDelivery"("subscriptionId", "sentAt");
CREATE INDEX "NotificationDelivery_recipientUserId_sentAt_idx" ON "NotificationDelivery"("recipientUserId", "sentAt");
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");
CREATE TABLE "new_NotificationSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "label" TEXT,
    "kind" TEXT NOT NULL,
    "eventTypes" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "secret" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'NONE',
    "authConfigJson" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationSubscription" ("createdAt", "enabled", "eventTypes", "id", "kind", "secret", "target", "updatedAt") SELECT "createdAt", "enabled", "eventTypes", "id", "kind", "secret", "target", "updatedAt" FROM "NotificationSubscription";
DROP TABLE "NotificationSubscription";
ALTER TABLE "new_NotificationSubscription" RENAME TO "NotificationSubscription";
CREATE INDEX "NotificationSubscription_kind_enabled_idx" ON "NotificationSubscription"("kind", "enabled");
CREATE INDEX "NotificationSubscription_userId_idx" ON "NotificationSubscription"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_key_key" ON "AppConfig"("key");

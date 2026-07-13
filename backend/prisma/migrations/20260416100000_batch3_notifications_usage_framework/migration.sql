-- Batch #3: notifications + usage framework + subscriptions.
-- Run with `prisma migrate deploy`.

CREATE TABLE "NotificationSubscription" (
  "id"         TEXT PRIMARY KEY,
  "kind"       TEXT NOT NULL,          -- WEBHOOK | EMAIL
  "eventTypes" TEXT NOT NULL,          -- JSON array of DT event types subscribed to
  "target"     TEXT NOT NULL,          -- webhook URL or email address
  "secret"     TEXT,                   -- HMAC secret for webhooks
  "enabled"    BOOLEAN NOT NULL DEFAULT 1,
  "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  DATETIME NOT NULL
);
CREATE INDEX "NotificationSubscription_kind_enabled_idx" ON "NotificationSubscription"("kind","enabled");

CREATE TABLE "NotificationDelivery" (
  "id"             TEXT PRIMARY KEY,
  "subscriptionId" TEXT NOT NULL REFERENCES "NotificationSubscription"("id") ON DELETE CASCADE,
  "eventType"      TEXT NOT NULL,
  "payloadJson"    TEXT NOT NULL,
  "status"         TEXT NOT NULL,      -- OK | ERROR
  "httpStatus"     INTEGER,
  "errorMsg"       TEXT,
  "attempt"        INTEGER NOT NULL DEFAULT 1,
  "sentAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NotificationDelivery_sub_sent_idx" ON "NotificationDelivery"("subscriptionId","sentAt");
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- Usage framework — DataExport / DataImport + ODRL policies.
CREATE TABLE "DataExport" (
  "id"              TEXT PRIMARY KEY,
  "iterationId"     TEXT REFERENCES "Iteration"("id"),
  "targetPartnerId" TEXT REFERENCES "Partner"("id"),
  "manifestId"      TEXT REFERENCES "IterationManifest"("id"),
  "policyJson"      TEXT,                -- ODRL JSON-LD
  "status"          TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | SIGNED | TRANSMITTED | REVOKED
  "createdById"     TEXT REFERENCES "User"("id"),
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transmittedAt"   DATETIME
);
CREATE INDEX "DataExport_status_idx" ON "DataExport"("status");
CREATE INDEX "DataExport_manifestId_idx" ON "DataExport"("manifestId");

CREATE TABLE "DataImport" (
  "id"            TEXT PRIMARY KEY,
  "sourcePartner" TEXT NOT NULL,
  "manifestHash"  TEXT NOT NULL,
  "manifestJson"  TEXT NOT NULL,
  "policyJson"    TEXT,
  "signature"     TEXT,
  "verified"      BOOLEAN NOT NULL DEFAULT 0,
  "verifyReason"  TEXT,
  "acceptedById"  TEXT REFERENCES "User"("id"),
  "acceptedAt"    DATETIME,
  "receivedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DataImport_verified_idx" ON "DataImport"("verified");

-- Federated AAS Registry sync
CREATE TABLE "AasRegistryPeer" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "registryUrl" TEXT NOT NULL,
  "lastSyncAt"  DATETIME,
  "lastError"   TEXT,
  "enabled"     BOOLEAN NOT NULL DEFAULT 1,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AasRegistryShell" (
  "id"           TEXT PRIMARY KEY,
  "peerId"       TEXT NOT NULL REFERENCES "AasRegistryPeer"("id") ON DELETE CASCADE,
  "shellId"      TEXT NOT NULL,
  "descriptorJson" TEXT NOT NULL,
  "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AasRegistryShell_peer_shell_idx" ON "AasRegistryShell"("peerId","shellId");

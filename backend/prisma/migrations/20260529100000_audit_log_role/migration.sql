-- Add actorRole column to AdminAuditLog so the audit page can group/filter by
-- role-at-time-of-action (User.role may change after the fact).
ALTER TABLE "AdminAuditLog" ADD COLUMN "actorRole" TEXT;

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorRole_timestamp_idx" ON "AdminAuditLog"("actorRole", "timestamp");

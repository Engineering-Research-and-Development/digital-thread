-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "fullName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
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

-- Data migration: the user ROLE "PARTNER" was renamed to "OPERATOR"
-- (disambiguates the role from the Partner entity). This touches ONLY the
-- User.role column; the file-classification level "PARTNER" and every Partner
-- entity / partnerId / responsiblePartnerIds value are intentionally untouched.
-- AdminAuditLog.actorRole history is left as-is (append-only; immutable record
-- of the role at action time).
UPDATE "User" SET "role" = 'OPERATOR' WHERE "role" = 'PARTNER';

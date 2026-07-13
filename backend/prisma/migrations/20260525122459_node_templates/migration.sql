-- CreateTable
CREATE TABLE "NodeTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeTemplate_slug_key" ON "NodeTemplate"("slug");

-- CreateIndex
CREATE INDEX "NodeTemplate_enabled_sortOrder_idx" ON "NodeTemplate"("enabled", "sortOrder");

-- AlterTable
ALTER TABLE "FileRecord" ADD COLUMN "nodeOutputId" TEXT;

-- AlterTable
ALTER TABLE "NodeRuntimeState" ADD COLUMN "outputsJson" TEXT;

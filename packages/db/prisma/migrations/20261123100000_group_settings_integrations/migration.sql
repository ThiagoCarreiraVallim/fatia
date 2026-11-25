-- #413: configurações da comunidade (marca, capa, seções), chaves de API com
-- cota do mês e a área das ideias do painel. Só aditiva: nenhuma coluna ou
-- linha existente muda.

-- CreateEnum
CREATE TYPE "IdeaArea" AS ENUM ('COMMUNITY', 'MEMBERS', 'PLANS', 'REPORT');

-- CreateEnum
CREATE TYPE "CommunitySection" AS ENUM ('NUTRITION_TIPS', 'NUTRITION_PLANS', 'CHALLENGES', 'FEED', 'AGENDA');

-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('INVITES', 'MEMBERS', 'SENDS');

-- AlterTable
ALTER TABLE "FeedbackIdea" ADD COLUMN     "area" "IdeaArea";

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "coverFileId" TEXT,
ADD COLUMN     "hiddenSections" "CommunitySection"[] DEFAULT ARRAY[]::"CommunitySection"[];

-- CreateTable
CREATE TABLE "GroupApiKey" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "scopes" "ApiKeyScope"[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "GroupApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupApiMonthUsage" (
    "groupId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupApiMonthUsage_pkey" PRIMARY KEY ("groupId","month")
);

-- CreateTable
CREATE TABLE "GroupApiCall" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupApiCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupApiKey_hash_key" ON "GroupApiKey"("hash");

-- CreateIndex
CREATE INDEX "GroupApiKey_groupId_revokedAt_idx" ON "GroupApiKey"("groupId", "revokedAt");

-- CreateIndex
-- O apagar em cascata da comunidade acha as linhas por aqui.
CREATE INDEX "GroupApiCall_groupId_idx" ON "GroupApiCall"("groupId");

-- CreateIndex
CREATE INDEX "GroupApiCall_keyId_at_idx" ON "GroupApiCall"("keyId", "at");

-- CreateIndex
CREATE INDEX "GroupApiCall_at_idx" ON "GroupApiCall"("at");

-- CreateIndex
CREATE UNIQUE INDEX "Group_coverFileId_key" ON "Group"("coverFileId");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_coverFileId_fkey" FOREIGN KEY ("coverFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupApiKey" ADD CONSTRAINT "GroupApiKey_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupApiKey" ADD CONSTRAINT "GroupApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupApiMonthUsage" ADD CONSTRAINT "GroupApiMonthUsage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupApiCall" ADD CONSTRAINT "GroupApiCall_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupApiCall" ADD CONSTRAINT "GroupApiCall_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "GroupApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A cor gravada é sempre hex minúsculo de 6 dígitos (a API normaliza e confere
-- o contraste com `checkBrandColor`).
ALTER TABLE "Group" ADD CONSTRAINT "Group_brandColor_hex" CHECK ("brandColor" IS NULL OR "brandColor" ~ '^#[0-9a-f]{6}$');

ALTER TABLE "GroupApiKey" ADD CONSTRAINT "GroupApiKey_name_len" CHECK (char_length("name") BETWEEN 1 AND 60);
ALTER TABLE "GroupApiKey" ADD CONSTRAINT "GroupApiKey_lastFour_len" CHECK (char_length("lastFour") = 4);
ALTER TABLE "GroupApiKey" ADD CONSTRAINT "GroupApiKey_scopes_nonempty" CHECK (cardinality("scopes") > 0);
ALTER TABLE "GroupApiMonthUsage" ADD CONSTRAINT "GroupApiMonthUsage_month_fmt" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "GroupApiMonthUsage" ADD CONSTRAINT "GroupApiMonthUsage_calls_nonneg" CHECK ("calls" >= 0);

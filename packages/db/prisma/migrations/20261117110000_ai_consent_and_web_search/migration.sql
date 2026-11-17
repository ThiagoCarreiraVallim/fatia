-- CreateEnum
CREATE TYPE "AiConsentKind" AS ENUM ('CHAT', 'WEB_SEARCH');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "webSearchEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AiConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AiConsentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiConsent_userId_kind_version_key" ON "AiConsent"("userId", "kind", "version");

-- AddForeignKey
ALTER TABLE "AiConsent" ADD CONSTRAINT "AiConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

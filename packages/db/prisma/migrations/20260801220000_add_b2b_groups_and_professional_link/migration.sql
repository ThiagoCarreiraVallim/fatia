-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('SPONSORED', 'SOCIAL');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'PROFESSIONAL', 'CREATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "ShareScope" AS ENUM ('WORKOUT', 'NUTRITION', 'BODY', 'HABITS', 'GOALS');

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "type" "GroupType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalLink" (
    "id" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "scopes" "ShareScope"[],
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalAccessLog" (
    "id" TEXT NOT NULL,
    "linkId" TEXT,
    "professionalId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "scope" "ShareScope" NOT NULL,
    "action" TEXT NOT NULL,
    "denied" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE INDEX "Group_ownerId_idx" ON "Group"("ownerId");

-- CreateIndex
CREATE INDEX "Group_type_idx" ON "Group"("type");

-- CreateIndex
CREATE INDEX "GroupMembership_userId_status_idx" ON "GroupMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "GroupMembership_groupId_status_idx" ON "GroupMembership"("groupId", "status");

-- CreateIndex
CREATE INDEX "GroupMembership_groupId_role_idx" ON "GroupMembership"("groupId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_userId_key" ON "GroupMembership"("groupId", "userId");

-- CreateIndex
CREATE INDEX "ProfessionalLink_professionalId_revokedAt_idx" ON "ProfessionalLink"("professionalId", "revokedAt");

-- CreateIndex
CREATE INDEX "ProfessionalLink_subjectUserId_revokedAt_idx" ON "ProfessionalLink"("subjectUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "ProfessionalLink_groupId_revokedAt_idx" ON "ProfessionalLink"("groupId", "revokedAt");

-- CreateIndex
CREATE INDEX "ProfessionalAccessLog_subjectUserId_at_idx" ON "ProfessionalAccessLog"("subjectUserId", "at");

-- CreateIndex
CREATE INDEX "ProfessionalAccessLog_professionalId_at_idx" ON "ProfessionalAccessLog"("professionalId", "at");

-- CreateIndex
CREATE INDEX "ProfessionalAccessLog_linkId_at_idx" ON "ProfessionalAccessLog"("linkId", "at");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalLink" ADD CONSTRAINT "ProfessionalLink_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalLink" ADD CONSTRAINT "ProfessionalLink_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalLink" ADD CONSTRAINT "ProfessionalLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAccessLog" ADD CONSTRAINT "ProfessionalAccessLog_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ProfessionalLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalAccessLog" ADD CONSTRAINT "ProfessionalAccessLog_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

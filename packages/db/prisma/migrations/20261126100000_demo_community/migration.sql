-- #412: comunidade de demonstração (Academia Exemplo) com a aluna fictícia e a
-- sessão curta "Abrir no app como Ana Exemplo". Só aditiva: nenhuma coluna ou
-- linha existente muda; toda comunidade e conta de hoje fica `isDemo = false`
-- e `demoGroupId = NULL`.

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "demoOwnerId" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "demoGroupId" TEXT;

-- CreateTable
CREATE TABLE "DemoSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoSession_tokenHash_key" ON "DemoSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DemoSession_groupId_idx" ON "DemoSession"("groupId");

-- CreateIndex
CREATE INDEX "DemoSession_userId_idx" ON "DemoSession"("userId");

-- CreateIndex
CREATE INDEX "DemoSession_createdById_idx" ON "DemoSession"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Group_demoOwnerId_key" ON "Group"("demoOwnerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_demoGroupId_key" ON "User"("demoGroupId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_demoGroupId_fkey" FOREIGN KEY ("demoGroupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_demoOwnerId_fkey" FOREIGN KEY ("demoOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A demo é marcada pelos dois campos juntos, e o dono da demo é o dono da
-- comunidade: sem isto, uma linha com `isDemo` sem dono (ou o contrário)
-- escaparia dos filtros que olham só um deles.
ALTER TABLE "Group" ADD CONSTRAINT "Group_demo_owner_check" CHECK (
    ("isDemo" AND "demoOwnerId" IS NOT NULL AND "demoOwnerId" = "ownerId")
    OR (NOT "isDemo" AND "demoOwnerId" IS NULL)
);

-- CreateTable
CREATE TABLE "McpOAuthConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthConnectionToken" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthConnectionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthConnection_userId_clientId_key" ON "McpOAuthConnection"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthConnectionToken_hash_key" ON "McpOAuthConnectionToken"("hash");

-- CreateIndex
CREATE INDEX "McpOAuthConnectionToken_connectionId_idx" ON "McpOAuthConnectionToken"("connectionId");

-- CreateIndex
CREATE INDEX "McpOAuthConnectionToken_expiresAt_idx" ON "McpOAuthConnectionToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "McpOAuthConnection" ADD CONSTRAINT "McpOAuthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthConnection" ADD CONSTRAINT "McpOAuthConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthConnectionToken" ADD CONSTRAINT "McpOAuthConnectionToken_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "McpOAuthConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;


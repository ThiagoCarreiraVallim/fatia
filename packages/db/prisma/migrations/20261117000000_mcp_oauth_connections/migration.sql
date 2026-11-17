-- CreateTable
CREATE TABLE "McpOAuthConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "accessTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthConnection_accessTokenHash_key" ON "McpOAuthConnection"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthConnection_userId_clientId_key" ON "McpOAuthConnection"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "McpOAuthConnection" ADD CONSTRAINT "McpOAuthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthConnection" ADD CONSTRAINT "McpOAuthConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;


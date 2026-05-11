-- OAuth facade pro MCP (DCR + authorize/token federando pro Logto)

CREATE TABLE "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");

CREATE TABLE "McpOAuthAuthorization" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "code" TEXT,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "clientState" TEXT,
    "clientCodeChallenge" TEXT NOT NULL,
    "logtoCodeVerifier" TEXT NOT NULL,
    "logtoCode" TEXT,
    "resource" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpOAuthAuthorization_state_key" ON "McpOAuthAuthorization"("state");
CREATE UNIQUE INDEX "McpOAuthAuthorization_code_key" ON "McpOAuthAuthorization"("code");
CREATE INDEX "McpOAuthAuthorization_clientId_idx" ON "McpOAuthAuthorization"("clientId");
CREATE INDEX "McpOAuthAuthorization_expiresAt_idx" ON "McpOAuthAuthorization"("expiresAt");

ALTER TABLE "McpOAuthAuthorization"
    ADD CONSTRAINT "McpOAuthAuthorization_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("clientId")
    ON DELETE CASCADE ON UPDATE CASCADE;

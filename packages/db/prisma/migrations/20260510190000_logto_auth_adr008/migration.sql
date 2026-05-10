-- Migration: ADR 008 — Replace password auth with Logto OIDC
--
-- Changes:
--   1. Drop McpToken table (static bearer tokens replaced by Logto OAuth)
--   2. Clear User rows (password-based accounts cannot log in via Logto;
--      users will re-register automatically on first Logto login)
--   3. Add logtoSub column (Logto JWT sub claim — stable external identity)
--   4. Drop passwordHash column (no longer needed)

-- 1. Drop McpToken (foreign key to User with ON DELETE CASCADE)
DROP TABLE IF EXISTS "McpToken";

-- 2. Clear existing password-based users (cascade wipes all user data)
DELETE FROM "User";

-- 3. Add logtoSub — safe to set NOT NULL immediately since table is empty
ALTER TABLE "User" ADD COLUMN "logtoSub" TEXT NOT NULL;

-- 4. Unique constraint (Prisma convention: {Model}_{field}_key)
CREATE UNIQUE INDEX "User_logtoSub_key" ON "User"("logtoSub");

-- 5. Index for fast JWT lookups
CREATE INDEX "User_logtoSub_idx" ON "User"("logtoSub");

-- 6. Drop old password auth column
ALTER TABLE "User" DROP COLUMN "passwordHash";

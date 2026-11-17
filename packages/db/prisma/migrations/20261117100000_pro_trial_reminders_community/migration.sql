-- #386: teste grátis do PRO, forma de pagamento, avisos de cobrança e PRO pela comunidade.
-- Só aditiva: valores novos de enum, colunas nulas ou com padrão, uma tabela nova.

-- Teste grátis (TRIALING) e forma de pagamento da web.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BOLETO', 'CREDIT_CARD');
ALTER TABLE "UserSubscription" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "UserSubscription" ADD COLUMN "paymentMethod" "PaymentMethod";
ALTER TABLE "User" ADD COLUMN "proTrialStartedAt" TIMESTAMP(3);

-- Avisos de cobrança (Ex-03): uma linha por aviso enviado, sem repetir.
CREATE TYPE "BillingReminderKind" AS ENUM ('TRIAL_ENDING', 'DUE_SOON', 'DUE_TODAY', 'GRACE_5_LEFT', 'GRACE_2_LEFT', 'AI_PAUSED', 'STORE_BILLING_ISSUE');
CREATE TABLE "BillingReminder" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" "BillingReminderKind" NOT NULL,
    "dueDate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingReminder_subscriptionId_kind_dueDate_key" ON "BillingReminder"("subscriptionId", "kind", "dueDate");
ALTER TABLE "BillingReminder" ADD CONSTRAINT "BillingReminder_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Aviso de conta no celular e na central.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'BILLING';

-- PRO pela comunidade (#288): todos os membros ativos, e programa com data final.
CREATE TYPE "GroupAiMode" AS ENUM ('SEATS', 'ALL_MEMBERS');
ALTER TABLE "GroupSeatPool" ADD COLUMN "mode" "GroupAiMode" NOT NULL DEFAULT 'SEATS';
ALTER TABLE "GroupSeatPool" ADD COLUMN "programName" TEXT;

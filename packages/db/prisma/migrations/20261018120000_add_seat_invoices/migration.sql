-- Histórico de cobranças dos assentos (Fase 6). Só cria: nada existente muda.
CREATE TYPE "SeatInvoiceKind" AS ENUM ('SUBSCRIPTION', 'ADJUSTMENT');

CREATE TYPE "SeatInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'VOID');

CREATE TABLE "GroupSeatInvoice" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "kind" "SeatInvoiceKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" TEXT,
    "status" "SeatInvoiceStatus" NOT NULL,
    "invoiceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupSeatInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupSeatInvoice_providerPaymentId_key" ON "GroupSeatInvoice"("providerPaymentId");

CREATE INDEX "GroupSeatInvoice_poolId_createdAt_idx" ON "GroupSeatInvoice"("poolId", "createdAt");

ALTER TABLE "GroupSeatInvoice" ADD CONSTRAINT "GroupSeatInvoice_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "GroupSeatPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

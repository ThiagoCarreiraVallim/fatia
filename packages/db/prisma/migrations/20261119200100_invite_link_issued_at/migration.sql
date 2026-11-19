-- Link do convite nominal para o WhatsApp (#401, revisão): reaproveitado por 10 minutos.
ALTER TABLE "GroupInvite" ADD COLUMN "linkIssuedAt" TIMESTAMP(3);

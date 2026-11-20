-- #404 (ADR 043): administrador e recepção da comunidade, especialidade do
-- profissional, "profissionais veem só quem acompanham" e o último acesso ao painel.
ALTER TYPE "GroupRole" ADD VALUE IF NOT EXISTS 'ADMIN' AFTER 'OWNER';
ALTER TYPE "GroupRole" ADD VALUE IF NOT EXISTS 'RECEPTION' AFTER 'CREATOR';

CREATE TYPE "TeamSpecialty" AS ENUM ('TRAINING', 'NUTRITION', 'PHYSIO', 'OTHER');

ALTER TABLE "GroupMembership" ADD COLUMN "specialty" "TeamSpecialty";
ALTER TABLE "GroupMembership" ADD COLUMN "panelSeenAt" TIMESTAMP(3);

ALTER TABLE "Group" ADD COLUMN "proSeeOnlyAssigned" BOOLEAN NOT NULL DEFAULT false;

-- Comunicados (#394, revisão): a âncora das repetições e as tentativas.
ALTER TABLE "GroupAnnouncement" ADD COLUMN "anchorAt" TIMESTAMP(3),
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "GroupAnnouncement" SET "anchorAt" = "nextRunAt" WHERE "nextRunAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstStepsDoneAt" TIMESTAMP(3),
ADD COLUMN     "firstStepsSince" TIMESTAMP(3),
ADD COLUMN     "onboardingDraft" JSONB,
ADD COLUMN     "onboardingStep" TEXT;

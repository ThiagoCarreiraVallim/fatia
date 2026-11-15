-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('WATER', 'MEAL', 'WEIGHT', 'WORKOUT', 'STEPS', 'HABIT');

-- CreateEnum
CREATE TYPE "ReminderMode" AS ENUM ('INTERVAL', 'TIMES');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'ANNOUNCEMENTS';
ALTER TYPE "NotificationKind" ADD VALUE 'PLAN_RECEIVED';
ALTER TYPE "NotificationKind" ADD VALUE 'ASSESSMENT_REQUESTED';
ALTER TYPE "NotificationKind" ADD VALUE 'QUESTIONNAIRE';
ALTER TYPE "NotificationKind" ADD VALUE 'SCHEDULE';
ALTER TYPE "NotificationKind" ADD VALUE 'SCHEDULE_REMINDER';
ALTER TYPE "NotificationKind" ADD VALUE 'BIRTHDAY';
ALTER TYPE "NotificationKind" ADD VALUE 'REMINDERS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "quietFrom" INTEGER NOT NULL DEFAULT 1320,
ADD COLUMN     "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quietTo" INTEGER NOT NULL DEFAULT 420;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "habitId" TEXT,
    "mode" "ReminderMode" NOT NULL,
    "everyHours" INTEGER,
    "fromMinute" INTEGER,
    "toMinute" INTEGER,
    "times" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "weekdays" INTEGER[],
    "stepsBelow" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "sentDate" TEXT,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_userId_createdAt_idx" ON "Reminder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Reminder_enabled_idx" ON "Reminder"("enabled");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

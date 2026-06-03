ALTER TABLE "Exercise" ADD COLUMN "primaryMuscles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Exercise" ADD COLUMN "secondaryMuscles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Exercise" ADD COLUMN "equipment" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "level" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "mechanic" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "instructions" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Exercise" ADD COLUMN "youtubeVideoId" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "youtubeVideoIdPt" TEXT;

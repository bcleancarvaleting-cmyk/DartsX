ALTER TABLE "Player" ADD COLUMN "ranking" INTEGER;
ALTER TABLE "Player" ADD COLUMN "nickname" TEXT;
ALTER TABLE "Player" ADD COLUMN "earningsGbp" INTEGER;
CREATE TYPE "DartsStatus" AS ENUM ('UPCOMING', 'LIVE', 'FINISHED');
CREATE TABLE "DartsEvent" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "tour" TEXT NOT NULL, "venue" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "DartsStatus" NOT NULL DEFAULT 'UPCOMING', "simulated" BOOLEAN NOT NULL DEFAULT true,
  "providerRef" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DartsEvent_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DartsEvent_providerRef_key" ON "DartsEvent"("providerRef");
CREATE TABLE "DartsRound" (
  "id" UUID NOT NULL, "eventId" UUID NOT NULL, "number" INTEGER NOT NULL, "name" TEXT NOT NULL, "stage" TEXT,
  "legsToWin" INTEGER NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "status" "DartsStatus" NOT NULL DEFAULT 'UPCOMING',
  CONSTRAINT "DartsRound_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DartsRound_eventId_number_key" ON "DartsRound"("eventId", "number");
ALTER TABLE "DartsRound" ADD CONSTRAINT "DartsRound_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DartsEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DartsMatch" (
  "id" UUID NOT NULL, "roundId" UUID NOT NULL, "order" INTEGER NOT NULL, "aId" UUID NOT NULL, "bId" UUID NOT NULL,
  "legsA" INTEGER NOT NULL DEFAULT 0, "legsB" INTEGER NOT NULL DEFAULT 0, "winnerId" UUID,
  "status" "DartsStatus" NOT NULL DEFAULT 'UPCOMING', "startsAt" TIMESTAMP(3) NOT NULL,
  "statsA" JSONB, "statsB" JSONB, "providerRef" TEXT,
  CONSTRAINT "DartsMatch_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DartsMatch_providerRef_key" ON "DartsMatch"("providerRef");
CREATE INDEX "DartsMatch_roundId_idx" ON "DartsMatch"("roundId");
CREATE INDEX "DartsMatch_aId_idx" ON "DartsMatch"("aId");
CREATE INDEX "DartsMatch_bId_idx" ON "DartsMatch"("bId");
ALTER TABLE "DartsMatch" ADD CONSTRAINT "DartsMatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "DartsRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

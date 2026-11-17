CREATE TYPE "DartsGameKind" AS ENUM ('ROUND', 'EVENT');
CREATE TYPE "DartsGameStatus" AS ENUM ('OPEN', 'LOCKED', 'SETTLED', 'CANCELLED');
CREATE TABLE "DartsGame" (
  "id" UUID NOT NULL, "eventId" UUID NOT NULL, "roundId" UUID, "kind" "DartsGameKind" NOT NULL, "name" TEXT NOT NULL,
  "teamSize" INTEGER NOT NULL, "entryFeeMinor" INTEGER NOT NULL DEFAULT 100, "potPct" INTEGER DEFAULT 50,
  "maxEntries" INTEGER NOT NULL DEFAULT 1, "locksAt" TIMESTAMP(3) NOT NULL, "status" "DartsGameStatus" NOT NULL DEFAULT 'OPEN',
  "potMinor" INTEGER, "settledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DartsGame_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DartsGame_eventId_roundId_kind_key" ON "DartsGame"("eventId", "roundId", "kind");
CREATE INDEX "DartsGame_status_locksAt_idx" ON "DartsGame"("status", "locksAt");
CREATE TABLE "DartsEntry" (
  "id" UUID NOT NULL, "gameId" UUID NOT NULL, "userId" UUID NOT NULL, "entryNo" INTEGER NOT NULL DEFAULT 1,
  "points" DOUBLE PRECISION NOT NULL DEFAULT 0, "rank" INTEGER, "prizeMinor" INTEGER NOT NULL DEFAULT 0, "boosterId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DartsEntry_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DartsEntry_gameId_userId_entryNo_key" ON "DartsEntry"("gameId", "userId", "entryNo");
CREATE INDEX "DartsEntry_userId_idx" ON "DartsEntry"("userId");
ALTER TABLE "DartsEntry" ADD CONSTRAINT "DartsEntry_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "DartsGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DartsPick" (
  "id" UUID NOT NULL, "entryId" UUID NOT NULL, "cardId" UUID NOT NULL, "playerId" UUID NOT NULL,
  "captain" BOOLEAN NOT NULL DEFAULT false, "boosted" BOOLEAN NOT NULL DEFAULT false, "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "DartsPick_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DartsPick_entryId_playerId_key" ON "DartsPick"("entryId", "playerId");
ALTER TABLE "DartsPick" ADD CONSTRAINT "DartsPick_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DartsEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DartsBooster" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "kind" TEXT NOT NULL, "source" TEXT NOT NULL, "usedEntryId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DartsBooster_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DartsBooster_usedEntryId_key" ON "DartsBooster"("usedEntryId");
CREATE INDEX "DartsBooster_userId_idx" ON "DartsBooster"("userId");

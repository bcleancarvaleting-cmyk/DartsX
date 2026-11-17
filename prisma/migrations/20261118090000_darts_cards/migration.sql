-- DartsX card design: player colours, Icons, set numbers and Rare-pack parallels.
ALTER TABLE "Player" ADD COLUMN "colours" JSONB;
ALTER TABLE "Player" ADD COLUMN "icon" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "setNo" INTEGER;

CREATE TABLE "DartsParallel" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "serial" INTEGER,
    "of" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DartsParallel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DartsParallel_cardId_key" ON "DartsParallel"("cardId");
CREATE UNIQUE INDEX "DartsParallel_playerId_kind_serial_key" ON "DartsParallel"("playerId", "kind", "serial");
CREATE INDEX "DartsParallel_playerId_kind_idx" ON "DartsParallel"("playerId", "kind");
ALTER TABLE "DartsParallel" ADD CONSTRAINT "DartsParallel_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

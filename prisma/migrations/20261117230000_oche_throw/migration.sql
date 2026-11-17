-- The pack-shop throw: three darts once a day for a pack discount code.
CREATE TABLE "OcheThrow" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "darts" JSONB NOT NULL,
    "pct" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OcheThrow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OcheThrow_code_key" ON "OcheThrow"("code");
CREATE UNIQUE INDEX "OcheThrow_userId_day_key" ON "OcheThrow"("userId", "day");

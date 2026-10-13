-- CreateTable
CREATE TABLE "SignalEvent" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "combinedScore" INTEGER NOT NULL,
    "barTime" TIMESTAMP(3) NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "stop" DOUBLE PRECISION NOT NULL,
    "target1" DOUBLE PRECISION NOT NULL,
    "target2" DOUBLE PRECISION NOT NULL,
    "dataStatus" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "barsChecked" INTEGER NOT NULL DEFAULT 0,
    "mfeR" DOUBLE PRECISION,
    "maeR" DOUBLE PRECISION,
    "resultR" DOUBLE PRECISION,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignalEvent_outcome_createdAt_idx" ON "SignalEvent"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "SignalEvent_stockId_interval_createdAt_idx" ON "SignalEvent"("stockId", "interval", "createdAt");

-- AddForeignKey
ALTER TABLE "SignalEvent" ADD CONSTRAINT "SignalEvent_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;


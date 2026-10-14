-- CreateEnum
CREATE TYPE "StockLocation" AS ENUM ('GUDANG', 'MEJA');

-- CreateEnum
CREATE TYPE "RestockStatus" AS ENUM ('MENUNGGU', 'SELESAI', 'DITOLAK', 'DIBATALKAN');

-- AlterTable
ALTER TABLE "StockBatch" ADD COLUMN     "counterRemaining" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "counterMinStock" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "location" "StockLocation" NOT NULL DEFAULT 'GUDANG',
ADD COLUMN     "restockLineId" TEXT;

-- CreateTable
CREATE TABLE "RestockRequest" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "RestockStatus" NOT NULL DEFAULT 'MENUNGGU',
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "rejectReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestockRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "sentQuantity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RestockRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestockRequest_status_createdAt_idx" ON "RestockRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RestockRequest_branchId_status_idx" ON "RestockRequest"("branchId", "status");

-- CreateIndex
CREATE INDEX "RestockRequestLine_requestId_idx" ON "RestockRequestLine"("requestId");

-- CreateIndex
CREATE INDEX "RestockRequestLine_itemId_idx" ON "RestockRequestLine"("itemId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_restockLineId_fkey" FOREIGN KEY ("restockLineId") REFERENCES "RestockRequestLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestockRequest" ADD CONSTRAINT "RestockRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestockRequestLine" ADD CONSTRAINT "RestockRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RestockRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestockRequestLine" ADD CONSTRAINT "RestockRequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Nilai stok meja dan permintaan restock (spec stok meja 2). Tiap ekspresi tidak pernah NULL.
ALTER TABLE "StockBatch" ADD CONSTRAINT stock_batch_counter_nonnegative CHECK ("counterRemaining" >= 0);
ALTER TABLE "StockItem" ADD CONSTRAINT stock_item_counter_min_nonnegative CHECK ("counterMinStock" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_location CHECK (
  ("kind" IN ('MASUK', 'RETUR') AND "location" = 'GUDANG') OR "kind" IN ('PINDAH', 'PENYESUAIAN', 'KELUAR')
);
ALTER TABLE "RestockRequest" ADD CONSTRAINT restock_request_decision CHECK (
  ("status" = 'MENUNGGU') = ("decidedAt" IS NULL)
  AND ("decidedAt" IS NULL) = ("decidedByName" IS NULL)
  AND ("status" = 'DITOLAK') = ("rejectReason" IS NOT NULL)
);
ALTER TABLE "RestockRequestLine" ADD CONSTRAINT restock_line_values CHECK (
  "requestedQuantity" > 0 AND ("sentQuantity" IS NULL OR "sentQuantity" >= 0)
);

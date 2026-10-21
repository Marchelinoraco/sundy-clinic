-- Biaya lainnya per sesi treatment dan salinannya di baris tagihan (spec biaya lainnya, 22 Okt 2026). Hanya menambah.
-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "otherCost" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ServiceCostLine" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceCostLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCostLine_serviceId_idx" ON "ServiceCostLine"("serviceId");

-- AddForeignKey
ALTER TABLE "ServiceCostLine" ADD CONSTRAINT "ServiceCostLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Nama dirapikan 1–60 karakter, nominal Rp 1 – Rp 2 miliar per sesi (BL11).
ALTER TABLE "ServiceCostLine" ADD CONSTRAINT "service_cost_line_values" CHECK (
  char_length(btrim("name")) BETWEEN 1 AND 60 AND "amount" BETWEEN 1 AND 2000000000
);

-- Salinan biaya baris tidak negatif, termasuk biaya lainnya; pelaksana hanya untuk treatment, id dan nama selalu berpasangan.
ALTER TABLE "InvoiceLine" DROP CONSTRAINT "invoice_line_cost_values";
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_cost_values" CHECK (
  "materialCost" >= 0 AND "toolCost" >= 0 AND "otherCost" >= 0 AND "commissionAmount" >= 0
  AND (("performerId" IS NULL) = ("performerName" IS NULL))
  AND ("performerId" IS NULL OR "kind" = 'TREATMENT')
);

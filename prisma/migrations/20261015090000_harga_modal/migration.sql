-- Harga modal, margin, dan komisi (spec docs/superpowers/specs/2026-10-14-harga-modal-margin-komisi-design.md bagian 3).
-- Hanya menambah kolom dan melonggarkan NOT NULL harga beli: rilis lama selalu menulis angka.

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "commissionAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "materialCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "performerId" TEXT,
ADD COLUMN     "performerName" TEXT,
ADD COLUMN     "toolCost" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceStockUse" ALTER COLUMN "unitCost" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "pricedAt" TIMESTAMP(3),
ADD COLUMN     "pricedByName" TEXT,
ALTER COLUMN "total" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseLine" ALTER COLUMN "unitCost" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "commissionKind" "DiscountKind",
ADD COLUMN     "commissionValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "materialCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "toolCost" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockBatch" ALTER COLUMN "unitCost" DROP NOT NULL;

-- Pelaksana tagihan lama dari catatan kunjungan, supaya laporan komisi bulan berjalan tidak kosong (spec 9).
UPDATE "InvoiceLine" l
SET "performerId" = t."performerId", "performerName" = t."performerName"
FROM "EncounterTreatment" t
WHERE l."encounterTreatmentId" = t."id" AND l."kind" = 'TREATMENT' AND l."performerId" IS NULL;

-- Biaya layanan tidak negatif; komisi kosong (0), persen 1..100, atau rupiah > 0.
ALTER TABLE "Service" ADD CONSTRAINT "service_cost_values" CHECK (
  "materialCost" BETWEEN 0 AND 2000000000
  AND "toolCost" BETWEEN 0 AND 2000000000
  -- Ditulis supaya tidak pernah bernilai NULL: CHECK yang NULL dianggap lulus.
  AND (
    ("commissionKind" IS NULL AND "commissionValue" = 0)
    OR ("commissionKind" IS NOT NULL AND (
      ("commissionKind" = 'PERSEN' AND "commissionValue" BETWEEN 1 AND 100)
      OR ("commissionKind" = 'NOMINAL' AND "commissionValue" BETWEEN 1 AND 2000000000)
    ))
  )
);

-- Salinan biaya baris tidak negatif; pelaksana hanya untuk treatment, id dan nama selalu berpasangan.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_cost_values" CHECK (
  "materialCost" >= 0 AND "toolCost" >= 0 AND "commissionAmount" >= 0
  AND (("performerId" IS NULL) = ("performerName" IS NULL))
  AND ("performerId" IS NULL OR "kind" = 'TREATMENT')
);

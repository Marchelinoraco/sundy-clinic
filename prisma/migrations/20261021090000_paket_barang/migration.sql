-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "packageSourceLineId" TEXT;

-- AlterTable
ALTER TABLE "PatientPackageItem" ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "unit" TEXT,
ALTER COLUMN "serviceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TreatmentPackageItem" ADD COLUMN     "itemId" TEXT,
ALTER COLUMN "serviceId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "InvoiceLine_packageSourceLineId_idx" ON "InvoiceLine"("packageSourceLineId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPackageItem_patientPackageId_itemId_key" ON "PatientPackageItem"("patientPackageId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPackageItem_packageId_itemId_key" ON "TreatmentPackageItem"("packageId", "itemId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_packageSourceLineId_fkey" FOREIGN KEY ("packageSourceLineId") REFERENCES "InvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPackageItem" ADD CONSTRAINT "TreatmentPackageItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Isi paket (spec paket barang PB1): tepat satu dari treatment atau barang; sesi 1..100, jumlah barang 1..1000.
ALTER TABLE "TreatmentPackageItem" DROP CONSTRAINT "treatment_package_item_sessions";
ALTER TABLE "TreatmentPackageItem" ADD CONSTRAINT "treatment_package_item_shape" CHECK (
  ("serviceId" IS NOT NULL AND "itemId" IS NULL AND "sessions" BETWEEN 1 AND 100)
  OR ("serviceId" IS NULL AND "itemId" IS NOT NULL AND "sessions" BETWEEN 1 AND 1000)
);
ALTER TABLE "PatientPackageItem" DROP CONSTRAINT "patient_package_item_sessions";
ALTER TABLE "PatientPackageItem" ADD CONSTRAINT "patient_package_item_shape" CHECK (
  ("serviceId" IS NOT NULL AND "itemId" IS NULL AND "sessions" BETWEEN 1 AND 100)
  OR ("serviceId" IS NULL AND "itemId" IS NOT NULL AND "unit" IS NOT NULL AND "sessions" BETWEEN 1 AND 1000)
);

-- Baris pemakaian paket (spec paket barang 3): treatment atau barang, Rp 0, tanpa diskon; baik dari paket customer
-- maupun dari paket yang dibeli di tagihan yang sama. Baris PAKET tidak memakai paket.
ALTER TABLE "InvoiceLine" DROP CONSTRAINT "invoice_line_package_shape";
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_package_shape" CHECK (
  (("kind" = 'PAKET') = ("treatmentPackageId" IS NOT NULL))
  AND ("kind" <> 'PAKET' OR ("quantity" = 1 AND "itemId" IS NULL AND "patientPackageItemId" IS NULL AND "packageSourceLineId" IS NULL))
  AND (("patientPackageItemId" IS NULL AND "packageSourceLineId" IS NULL)
       OR ("kind" IN ('TREATMENT', 'BARANG') AND "unitPrice" = 0 AND "discountAmount" = 0))
);

-- Penyerahan obat oleh Apoteker (sub-proyek keuangan 3).
-- Spec: docs/superpowers/specs/2026-10-07-resep-penyerahan-obat-design.md bagian 3.
-- Migrasi ini hanya menambah: kolom, tabel, enum, dan CHECK.


-- CreateEnum
CREATE TYPE "DispensingStatus" AS ENUM ('MENUNGGU', 'SELESAI', 'TANPA_OBAT');

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "pharmacyNote" TEXT;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "dispensingLineId" TEXT;

-- CreateTable
CREATE TABLE "Dispensing" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "DispensingStatus" NOT NULL DEFAULT 'MENUNGGU',
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispensing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispensingLine" (
    "id" TEXT NOT NULL,
    "dispensingId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "usage" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DispensingLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispensing_appointmentId_key" ON "Dispensing"("appointmentId");

-- CreateIndex
CREATE INDEX "Dispensing_status_createdAt_idx" ON "Dispensing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DispensingLine_dispensingId_idx" ON "DispensingLine"("dispensingId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_dispensingLineId_key" ON "InvoiceLine"("dispensingLineId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_dispensingLineId_fkey" FOREIGN KEY ("dispensingLineId") REFERENCES "DispensingLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispensing" ADD CONSTRAINT "Dispensing_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispensing" ADD CONSTRAINT "Dispensing_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispensingLine" ADD CONSTRAINT "DispensingLine_dispensingId_fkey" FOREIGN KEY ("dispensingId") REFERENCES "Dispensing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispensingLine" ADD CONSTRAINT "DispensingLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Penjagaan nilai di basis data (spec penyerahan 3.2).
ALTER TABLE "Dispensing" ADD CONSTRAINT dispensing_status_fields CHECK (
  ("status" = 'MENUNGGU' AND "completedAt" IS NULL AND "completedById" IS NULL AND "completedByName" IS NULL)
  OR ("status" IN ('SELESAI', 'TANPA_OBAT') AND "completedAt" IS NOT NULL AND "completedById" IS NOT NULL AND "completedByName" IS NOT NULL)
);

ALTER TABLE "DispensingLine" ADD CONSTRAINT dispensing_line_values CHECK ("quantity" > 0 AND btrim("usage") <> '');

ALTER TABLE "Encounter" ADD CONSTRAINT encounter_pharmacy_note_length CHECK ("pharmacyNote" IS NULL OR char_length("pharmacyNote") <= 1000);

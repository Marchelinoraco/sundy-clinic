-- Paket treatment (spec docs/superpowers/specs/2026-10-13-paket-treatment-deposit-design.md bagian 3).
-- Hanya menambah: rilis lama mengabaikan tabel dan kolom baru.

-- CreateEnum
CREATE TYPE "PatientPackageStatus" AS ENUM ('AKTIF', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "PackageEntryKind" AS ENUM ('BELI', 'PAKAI', 'BATAL_PAKAI', 'PERPANJANG', 'BATAL_PAKET');

-- AlterEnum

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "patientPackageItemId" TEXT,
ADD COLUMN     "treatmentPackageId" TEXT;

-- CreateTable
CREATE TABLE "TreatmentPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "validDays" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TreatmentPackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPackage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "purchaseLineId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "expiresOn" DATE NOT NULL,
    "status" "PatientPackageStatus" NOT NULL DEFAULT 'AKTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPackageItem" (
    "id" TEXT NOT NULL,
    "patientPackageId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PatientPackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageSessionEntry" (
    "id" TEXT NOT NULL,
    "patientPackageItemId" TEXT NOT NULL,
    "kind" "PackageEntryKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "invoiceLineId" TEXT,
    "reason" TEXT,
    "previousExpiresOn" DATE,
    "newExpiresOn" DATE,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageSessionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreatmentPackage_isActive_sortOrder_idx" ON "TreatmentPackage"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPackageItem_packageId_serviceId_key" ON "TreatmentPackageItem"("packageId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPackage_purchaseLineId_key" ON "PatientPackage"("purchaseLineId");

-- CreateIndex
CREATE INDEX "PatientPackage_patientId_idx" ON "PatientPackage"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPackageItem_patientPackageId_serviceId_key" ON "PatientPackageItem"("patientPackageId", "serviceId");

-- CreateIndex
CREATE INDEX "PackageSessionEntry_patientPackageItemId_idx" ON "PackageSessionEntry"("patientPackageItemId");

-- CreateIndex
CREATE INDEX "PackageSessionEntry_invoiceLineId_idx" ON "PackageSessionEntry"("invoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceLine_patientPackageItemId_idx" ON "InvoiceLine"("patientPackageItemId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_treatmentPackageId_fkey" FOREIGN KEY ("treatmentPackageId") REFERENCES "TreatmentPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_patientPackageItemId_fkey" FOREIGN KEY ("patientPackageItemId") REFERENCES "PatientPackageItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPackageItem" ADD CONSTRAINT "TreatmentPackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TreatmentPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPackageItem" ADD CONSTRAINT "TreatmentPackageItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TreatmentPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageItem" ADD CONSTRAINT "PatientPackageItem_patientPackageId_fkey" FOREIGN KEY ("patientPackageId") REFERENCES "PatientPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageSessionEntry" ADD CONSTRAINT "PackageSessionEntry_patientPackageItemId_fkey" FOREIGN KEY ("patientPackageItemId") REFERENCES "PatientPackageItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageSessionEntry" ADD CONSTRAINT "PackageSessionEntry_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Katalog: harga 0..2 M, masa berlaku 1..3650 hari, sesi 1..100.
ALTER TABLE "TreatmentPackage" ADD CONSTRAINT "treatment_package_values" CHECK ("price" >= 0 AND "price" <= 2000000000 AND "validDays" BETWEEN 1 AND 3650);
ALTER TABLE "TreatmentPackageItem" ADD CONSTRAINT "treatment_package_item_sessions" CHECK ("sessions" BETWEEN 1 AND 100);
ALTER TABLE "PatientPackageItem" ADD CONSTRAINT "patient_package_item_sessions" CHECK ("sessions" BETWEEN 1 AND 100);

-- Paket customer: berlaku sampai tidak sebelum mulai.
ALTER TABLE "PatientPackage" ADD CONSTRAINT "patient_package_dates" CHECK ("expiresOn" >= "startsOn");

-- Buku sesi: tanda delta sesuai jenis; perpanjangan selalu membawa tanggal lama, baru, dan alasan.
ALTER TABLE "PackageSessionEntry" ADD CONSTRAINT "package_entry_delta" CHECK (
  ("kind" = 'BELI' AND "delta" > 0)
  OR ("kind" = 'PAKAI' AND "delta" < 0)
  OR ("kind" = 'BATAL_PAKAI' AND "delta" > 0)
  OR ("kind" = 'BATAL_PAKET' AND "delta" <= 0)
  OR ("kind" = 'PERPANJANG' AND "delta" = 0 AND "previousExpiresOn" IS NOT NULL AND "newExpiresOn" IS NOT NULL AND "reason" IS NOT NULL AND "reason" <> '')
);

-- Baris PAKET: merujuk paket katalog, jumlah 1, tanpa barang/sesi. Baris pemakaian: TREATMENT, Rp 0, tanpa diskon.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_package_shape" CHECK (
  (("kind" = 'PAKET') = ("treatmentPackageId" IS NOT NULL))
  AND ("kind" <> 'PAKET' OR ("quantity" = 1 AND "itemId" IS NULL AND "patientPackageItemId" IS NULL))
  AND ("patientPackageItemId" IS NULL OR ("kind" = 'TREATMENT' AND "unitPrice" = 0 AND "discountAmount" = 0))
);

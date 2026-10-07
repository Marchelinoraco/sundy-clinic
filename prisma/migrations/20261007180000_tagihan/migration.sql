-- Tagihan dan pembayaran customer (sub-proyek keuangan 2).
-- Spec: docs/superpowers/specs/2026-10-07-tagihan-pembayaran-design.md bagian 3.
-- Migrasi ini hanya menambah: tabel, enum, nilai jurnal stok, CHECK, dan constraint eksklusi.


-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAF', 'FINAL', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "InvoiceLineKind" AS ENUM ('LAYANAN', 'TREATMENT', 'BARANG');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('NOMINAL', 'PERSEN');

-- AlterEnum
ALTER TYPE "StockMovementKind" ADD VALUE 'KELUAR';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "InvoiceNumberCounter" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAF',
    "version" INTEGER NOT NULL DEFAULT 1,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "branchId" TEXT NOT NULL,
    "discountKind" "DiscountKind",
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "discountByName" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByName" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByName" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "InvoiceLineKind" NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "serviceId" TEXT,
    "encounterTreatmentId" TEXT,
    "itemId" TEXT,
    "priceNote" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceStockUse" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,

    CONSTRAINT "InvoiceStockUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" DATE NOT NULL,
    "reference" TEXT,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByName" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_status_createdAt_idx" ON "Invoice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");

-- CreateIndex
CREATE INDEX "Invoice_appointmentId_idx" ON "Invoice"("appointmentId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_encounterTreatmentId_key" ON "InvoiceLine"("invoiceId", "encounterTreatmentId");

-- CreateIndex
CREATE INDEX "InvoiceStockUse_lineId_idx" ON "InvoiceStockUse"("lineId");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceStockUse" ADD CONSTRAINT "InvoiceStockUse_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Penjagaan nilai di basis data (spec tagihan 3.4).
-- Tagihan final wajib bernomor dan berwaktu final; draf tidak boleh bernomor.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_status_fields CHECK (
  ("status" <> 'FINAL' OR ("number" IS NOT NULL AND "finalizedAt" IS NOT NULL))
  AND ("status" <> 'DRAF' OR "number" IS NULL)
);

-- Diskon: tidak negatif, persen paling banyak 100, wajib jenis dan alasan bila bernilai.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_discount_values CHECK (
  "discountValue" >= 0
  AND ("discountKind" IS NOT NULL OR "discountValue" = 0)
  AND ("discountKind" IS DISTINCT FROM 'PERSEN' OR "discountValue" <= 100)
  AND ("discountValue" = 0 OR "discountReason" IS NOT NULL)
);

-- Satu tagihan aktif (bukan dibatalkan) per kunjungan.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_one_active_per_appointment
  EXCLUDE USING btree ("appointmentId" WITH =)
  WHERE ("appointmentId" IS NOT NULL AND "status" <> 'DIBATALKAN');

ALTER TABLE "InvoiceLine" ADD CONSTRAINT invoice_line_values CHECK (
  "quantity" > 0 AND "unitPrice" >= 0 AND (("kind" = 'BARANG') = ("itemId" IS NOT NULL))
);

ALTER TABLE "InvoiceStockUse" ADD CONSTRAINT invoice_stock_use_values CHECK ("quantity" > 0 AND "unitCost" >= 0);

ALTER TABLE "InvoicePayment" ADD CONSTRAINT invoice_payment_amount_positive CHECK ("amount" > 0);

-- Stok barang, supplier, dan hutang (sub-proyek keuangan 1).
-- Spec: docs/superpowers/specs/2026-10-07-stok-supplier-hutang-design.md bagian 4.
-- Migrasi ini hanya menambah: tabel, enum, nilai peran, dan CHECK. Rilis lama tetap berjalan.


-- CreateEnum
CREATE TYPE "StockItemKind" AS ENUM ('OBAT', 'PRODUK');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('MASUK', 'RETUR', 'PENYESUAIAN');

-- CreateEnum
CREATE TYPE "StockAdjustReason" AS ENUM ('RUSAK', 'HILANG', 'KEDALUWARSA', 'SELISIH_HITUNG', 'LAINNYA');

-- CreateEnum
CREATE TYPE "SupplierPaymentKind" AS ENUM ('BAYAR', 'PENGEMBALIAN');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TUNAI', 'TRANSFER', 'QRIS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StaffRole" ADD VALUE 'APOTEKER';
ALTER TYPE "StaffRole" ADD VALUE 'ADMIN_KEUANGAN';

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StockItemKind" NOT NULL,
    "unit" TEXT NOT NULL,
    "sellPrice" INTEGER,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "total" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByName" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "purchaseLineId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" DATE,
    "unitCost" INTEGER NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "StockAdjustReason",
    "note" TEXT,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "supplierReturnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "note" TEXT,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "SupplierReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "SupplierPaymentKind" NOT NULL,
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

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_code_key" ON "StockItem"("code");

-- CreateIndex
CREATE INDEX "StockItem_isActive_name_idx" ON "StockItem"("isActive", "name");

-- CreateIndex
CREATE INDEX "Supplier_isActive_name_idx" ON "Supplier"("isActive", "name");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_dueDate_idx" ON "PurchaseInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_branchId_invoiceDate_idx" ON "PurchaseInvoice"("branchId", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_supplierId_invoiceNumber_key" ON "PurchaseInvoice"("supplierId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "PurchaseLine_invoiceId_idx" ON "PurchaseLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_purchaseLineId_key" ON "StockBatch"("purchaseLineId");

-- CreateIndex
CREATE INDEX "StockBatch_itemId_branchId_idx" ON "StockBatch"("itemId", "branchId");

-- CreateIndex
CREATE INDEX "StockBatch_branchId_expiryDate_idx" ON "StockBatch"("branchId", "expiryDate");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_createdAt_idx" ON "StockMovement"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierReturn_invoiceId_idx" ON "SupplierReturn"("invoiceId");

-- CreateIndex
CREATE INDEX "SupplierReturnLine_returnId_idx" ON "SupplierReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "SupplierPayment_invoiceId_idx" ON "SupplierPayment"("invoiceId");

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "PurchaseLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnLine" ADD CONSTRAINT "SupplierReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnLine" ADD CONSTRAINT "SupplierReturnLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Penjagaan nilai di basis data (spec stok 4.3).
ALTER TABLE "StockItem" ADD CONSTRAINT stock_item_values
  CHECK ("minStock" >= 0 AND ("sellPrice" IS NULL OR "sellPrice" >= 0));

ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT purchase_invoice_dates
  CHECK ("dueDate" >= "invoiceDate" AND "total" >= 0);

ALTER TABLE "PurchaseLine" ADD CONSTRAINT purchase_line_values
  CHECK ("quantity" > 0 AND "unitCost" >= 0);

ALTER TABLE "StockBatch" ADD CONSTRAINT stock_batch_values
  CHECK ("quantityReceived" > 0 AND "unitCost" >= 0);

-- Sisa batch tidak pernah minus; pengurangan di aplikasi memakai UPDATE bersyarat.
ALTER TABLE "StockBatch" ADD CONSTRAINT stock_batch_remaining_nonnegative
  CHECK ("quantityRemaining" >= 0);

ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_nonzero
  CHECK ("quantity" <> 0);

-- Alasan hanya dan wajib untuk penyesuaian.
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_reason
  CHECK (("kind" = 'PENYESUAIAN') = ("reason" IS NOT NULL));

ALTER TABLE "SupplierReturnLine" ADD CONSTRAINT supplier_return_line_values
  CHECK ("quantity" > 0 AND "unitCost" >= 0 AND "amount" >= 0);

ALTER TABLE "SupplierPayment" ADD CONSTRAINT supplier_payment_amount_positive
  CHECK ("amount" > 0);

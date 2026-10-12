-- Perbaikan tagihan (spec docs/superpowers/specs/2026-10-13-perbaikan-tagihan-design.md bagian 3).
-- Hanya menambah: rilis lama mengabaikan kolom dan tabel baru.

-- CreateEnum
CREATE TYPE "LineDiscountSource" AS ENUM ('PROMO', 'MANUAL');

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "discountSource" "LineDiscountSource";

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "promoName" TEXT,
ADD COLUMN     "promoKind" "DiscountKind",
ADD COLUMN     "promoValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promoStartsOn" DATE,
ADD COLUMN     "promoEndsOn" DATE;

-- CreateTable
CREATE TABLE "ClinicBankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicBankAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "clinicBankAccountId" TEXT,
ADD COLUMN     "destinationLabel" TEXT,
ADD COLUMN     "senderAccountName" TEXT,
ADD COLUMN     "senderAccountNumber" TEXT,
ADD COLUMN     "senderBank" TEXT;

-- CreateIndex
CREATE INDEX "InvoicePayment_clinicBankAccountId_idx" ON "InvoicePayment"("clinicBankAccountId");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_clinicBankAccountId_fkey" FOREIGN KEY ("clinicBankAccountId") REFERENCES "ClinicBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Diskon baris: 0..harga baris; ada diskon ⇔ ada sumber, dan diskon selalu beralasan.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_discount_range" CHECK ("discountAmount" >= 0 AND "discountAmount" <= "quantity" * "unitPrice");
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "invoice_line_discount_reason" CHECK (
  ("discountAmount" = 0) = ("discountSource" IS NULL)
  AND ("discountAmount" = 0 OR ("discountReason" IS NOT NULL AND "discountReason" <> ''))
);

-- Promo barang: kosong sama sekali, atau lengkap dan masuk akal.
ALTER TABLE "StockItem" ADD CONSTRAINT "stock_item_promo_shape" CHECK (
  ("promoKind" IS NULL AND "promoValue" = 0 AND "promoName" IS NULL AND "promoStartsOn" IS NULL AND "promoEndsOn" IS NULL)
  OR (
    "promoKind" IS NOT NULL AND "promoValue" > 0 AND "promoName" IS NOT NULL AND "promoName" <> ''
    AND ("promoKind" <> 'PERSEN' OR "promoValue" <= 100)
    AND ("promoStartsOn" IS NULL OR "promoEndsOn" IS NULL OR "promoEndsOn" >= "promoStartsOn")
  )
);

-- Rekening tujuan dan salinan labelnya selalu bersamaan.
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "invoice_payment_destination_pair" CHECK (("clinicBankAccountId" IS NULL) = ("destinationLabel" IS NULL));

-- Rekening yang sudah ada di Pengaturan menjadi rekening klinik pertama (spec 3).
INSERT INTO "ClinicBankAccount" ("id", "bankName", "accountNumber", "accountHolder", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'rekening-awal', TRIM("bankName"), regexp_replace("bankAccountNumber", '[^0-9]', '', 'g'), TRIM("bankAccountHolder"), true, 0, now(), now()
FROM "ClinicSetting"
WHERE "id" = 1
  AND COALESCE(TRIM("bankName"), '') <> ''
  AND COALESCE(regexp_replace("bankAccountNumber", '[^0-9]', '', 'g'), '') <> ''
  AND COALESCE(TRIM("bankAccountHolder"), '') <> '';

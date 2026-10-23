-- Deposit booking, saldo deposit pasien, dan pengembalian (spec deposit). Hanya menambah.
-- CreateEnum
CREATE TYPE "DepositSource" AS ENUM ('KELEBIHAN_BAYAR', 'SISA_DEPOSIT_BOOKING');

-- CreateEnum
CREATE TYPE "DepositUseKind" AS ENUM ('BOOKING', 'SALDO');

-- CreateTable
CREATE TABLE "DepositCredit" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "DepositSource" NOT NULL,
    "sourceInvoiceId" TEXT,
    "sourcePaymentId" TEXT,
    "recordedOn" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositUse" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "DepositUseKind" NOT NULL,
    "creditId" TEXT,
    "appointmentId" TEXT,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositRefund" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedOn" DATE NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositRefundPart" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "DepositRefundPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositCredit_sourcePaymentId_key" ON "DepositCredit"("sourcePaymentId");

-- CreateIndex
CREATE INDEX "DepositCredit_patientId_validUntil_idx" ON "DepositCredit"("patientId", "validUntil");

-- CreateIndex
CREATE INDEX "DepositUse_invoiceId_idx" ON "DepositUse"("invoiceId");

-- CreateIndex
CREATE INDEX "DepositUse_creditId_idx" ON "DepositUse"("creditId");

-- CreateIndex
CREATE INDEX "DepositRefund_refundedOn_idx" ON "DepositRefund"("refundedOn");

-- CreateIndex
CREATE INDEX "DepositRefundPart_creditId_idx" ON "DepositRefundPart"("creditId");

-- AddForeignKey
ALTER TABLE "DepositCredit" ADD CONSTRAINT "DepositCredit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositCredit" ADD CONSTRAINT "DepositCredit_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositCredit" ADD CONSTRAINT "DepositCredit_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "InvoicePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositUse" ADD CONSTRAINT "DepositUse_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositUse" ADD CONSTRAINT "DepositUse_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "DepositCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositUse" ADD CONSTRAINT "DepositUse_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRefund" ADD CONSTRAINT "DepositRefund_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRefundPart" ADD CONSTRAINT "DepositRefundPart_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "DepositRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRefundPart" ADD CONSTRAINT "DepositRefundPart_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "DepositCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Jumlah selalu lebih dari 0; masa berlaku tidak sebelum tanggal dicatat.
ALTER TABLE "DepositCredit" ADD CONSTRAINT "deposit_credit_amount" CHECK ("amount" > 0 AND "validUntil" >= "recordedOn");
ALTER TABLE "DepositUse" ADD CONSTRAINT "deposit_use_amount" CHECK ("amount" > 0);
ALTER TABLE "DepositRefund" ADD CONSTRAINT "deposit_refund_amount" CHECK ("amount" > 0);
ALTER TABLE "DepositRefundPart" ADD CONSTRAINT "deposit_refund_part_amount" CHECK ("amount" > 0);

-- BOOKING menyebut booking tanpa kredit; SALDO menyebut kredit tanpa booking.
ALTER TABLE "DepositUse" ADD CONSTRAINT "deposit_use_target" CHECK (
  ("kind" = 'BOOKING' AND "appointmentId" IS NOT NULL AND "creditId" IS NULL)
  OR ("kind" = 'SALDO' AND "creditId" IS NOT NULL AND "appointmentId" IS NULL)
);

-- Satu booking hanya sekali menjadi deposit booking (dihapus lagi bila tagihannya dibatalkan).
CREATE UNIQUE INDEX "DepositUse_one_booking_per_appointment" ON "DepositUse"("appointmentId") WHERE "kind" = 'BOOKING';

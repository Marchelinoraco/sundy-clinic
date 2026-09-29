-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('MENUNGGU_DIISI', 'TERISI', 'DIPERIKSA');

-- CreateEnum
CREATE TYPE "IntakeKind" AS ENUM ('LENGKAP', 'PENDEK');

-- CreateEnum
CREATE TYPE "IntakePurpose" AS ENUM ('SLIMMING', 'AESTHETIC', 'BELUM_YAKIN');

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_patientId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "bookingFee" INTEGER,
ALTER COLUMN "patientId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Intake" (
    "id" TEXT NOT NULL,
    "status" "IntakeStatus" NOT NULL,
    "kind" "IntakeKind" NOT NULL,
    "purpose" "IntakePurpose",
    "claimsReturning" BOOLEAN,
    "quizVersion" INTEGER,
    "answers" JSONB,
    "name" TEXT,
    "whatsapp" TEXT,
    "birthDate" DATE,
    "gender" "Gender",
    "occupation" TEXT,
    "address" TEXT,
    "selfWeightKg" DECIMAL(5,1),
    "selfHeightCm" DECIMAL(5,1),
    "activityDate" DATE,
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submissionKey" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByStaffId" TEXT,
    "linkTokenHash" TEXT,
    "linkExpiresAt" TIMESTAMP(3),
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "bookingFee" INTEGER NOT NULL DEFAULT 100000,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountHolder" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Intake_submissionKey_key" ON "Intake"("submissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "Intake_linkTokenHash_key" ON "Intake"("linkTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Intake_appointmentId_key" ON "Intake"("appointmentId");

-- CreateIndex
CREATE INDEX "Intake_patientId_idx" ON "Intake"("patientId");

-- CreateIndex
CREATE INDEX "Intake_status_idx" ON "Intake"("status");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_reviewedByStaffId_fkey" FOREIGN KEY ("reviewedByStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Booking tanpa pasien hanya boleh berasal dari situs dan belum pernah
-- terkonfirmasi/hadir. Admin wajib mencocokkan pasien lebih dulu (spec 5.3).
ALTER TABLE "Appointment" ADD CONSTRAINT appointment_patient_required CHECK (
  "patientId" IS NOT NULL
  OR ("source" = 'SITUS' AND "status" IN ('MENUNGGU_KONFIRMASI', 'DIBATALKAN', 'KEDALUWARSA'))
);

-- Pengaturan klinik selalu tepat satu baris, dibuat di sini agar produksi
-- langsung punya nilainya tanpa menjalankan seed.
ALTER TABLE "ClinicSetting" ADD CONSTRAINT clinic_setting_single_row CHECK ("id" = 1);
INSERT INTO "ClinicSetting" ("id", "bookingFee", "updatedAt") VALUES (1, 100000, CURRENT_TIMESTAMP);

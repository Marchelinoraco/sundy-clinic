-- UI panel admin bagian C2: catatan pesan WhatsApp per booking (konfirmasi,
-- pengingat H-1, instruksi transfer). Aditif; tabel Appointment tidak berubah.
-- Spec: docs/superpowers/specs/2026-10-02-ui-pengingat-booking-design.md bagian 6.

-- CreateEnum
CREATE TYPE "AppointmentMessageKind" AS ENUM ('INSTRUKSI_TRANSFER', 'KONFIRMASI', 'PENGINGAT');

-- CreateEnum
CREATE TYPE "ReminderReply" AS ENUM ('AKAN_DATANG', 'MINTA_PINDAH', 'TIDAK_MEMBALAS');

-- CreateTable
CREATE TABLE "AppointmentMessage" (
    "id" TEXT NOT NULL,
    "kind" "AppointmentMessageKind" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentById" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedByName" TEXT,
    "reply" "ReminderReply",
    "repliedAt" TIMESTAMP(3),
    "repliedById" TEXT,
    "repliedByName" TEXT,
    "appointmentId" TEXT NOT NULL,

    CONSTRAINT "AppointmentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentMessage_appointmentId_kind_idx" ON "AppointmentMessage"("appointmentId", "kind");

-- AddForeignKey
ALTER TABLE "AppointmentMessage" ADD CONSTRAINT "AppointmentMessage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

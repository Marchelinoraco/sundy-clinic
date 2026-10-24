-- Pengingat treatment (spec pengingat treatment PT2, PT3, PT12). Hanya menambah.

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "returnReminderDays" INTEGER;
ALTER TABLE "Service" ADD CONSTRAINT "service_return_reminder_days"
  CHECK ("returnReminderDays" IS NULL OR "returnReminderDays" IN (7, 14, 21, 30, 60, 90, 180));

-- Nilai awal (PT3): 1 minggu untuk semua layanan kecuali konsultasi, timbang BIA, dan meal plan.
UPDATE "Service" SET "returnReminderDays" = 7
  WHERE "slug" NOT IN ('konsultasi-dokter', 'konsultasi-online', 'timbang-bia', 'meal-plan');

-- CreateTable
CREATE TABLE "TreatmentReminder" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "treatmentOn" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,

    CONSTRAINT "TreatmentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreatmentReminder_patientId_sentAt_idx" ON "TreatmentReminder"("patientId", "sentAt");

-- AddForeignKey
ALTER TABLE "TreatmentReminder" ADD CONSTRAINT "TreatmentReminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


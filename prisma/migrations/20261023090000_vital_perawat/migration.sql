-- Angka vital oleh perawat sebelum dokter memeriksa (spec vital perawat VP1–VP3, VP6). Hanya menambah.
CREATE TABLE "NurseVitals" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse" INTEGER,
    "temperatureC" DECIMAL(3,1),
    "weightKg" DECIMAL(5,1),
    "heightCm" DECIMAL(5,1),
    "waistCm" DECIMAL(5,1),
    "updatedById" TEXT NOT NULL,
    "updatedByName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedByName" TEXT,

    CONSTRAINT "NurseVitals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NurseVitals_appointmentId_key" ON "NurseVitals"("appointmentId");

ALTER TABLE "NurseVitals" ADD CONSTRAINT "NurseVitals_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

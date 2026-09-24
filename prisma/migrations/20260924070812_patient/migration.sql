-- CreateEnum
CREATE TYPE "PatientProgramStatus" AS ENUM ('AKTIF', 'SELESAI', 'TIDAK_AKTIF');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('L', 'P');

-- CreateTable
CREATE TABLE "PatientNumberCounter" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PatientNumberCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "medicalRecordNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "birthDate" DATE,
    "gender" "Gender",
    "occupation" TEXT,
    "address" TEXT,
    "allergies" TEXT,
    "medicalHistory" TEXT,
    "programStatus" "PatientProgramStatus" NOT NULL DEFAULT 'AKTIF',
    "activePackageId" TEXT,
    "lastVisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_medicalRecordNumber_key" ON "Patient"("medicalRecordNumber");

-- CreateIndex
CREATE INDEX "Patient_whatsapp_idx" ON "Patient"("whatsapp");

-- CreateIndex
CREATE INDEX "Patient_name_idx" ON "Patient"("name");

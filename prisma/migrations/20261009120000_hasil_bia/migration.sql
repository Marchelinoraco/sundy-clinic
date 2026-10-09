-- Hasil Timbang BIA (spec hasil BIA 3). Migrasi hanya menambah: dua tabel baru, tanpa mengubah tabel lama,
-- sehingga rilis sebelumnya tetap berjalan dan `deploy.sh kembali` aman.

-- CreateTable
CREATE TABLE "BiaMeasurement" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bodyFatPercent" DECIMAL(4,1),
    "muscleMassKg" DECIMAL(5,1),
    "visceralFat" INTEGER,
    "bmr" INTEGER,
    "metabolicAge" INTEGER,
    "bodyWaterPercent" DECIMAL(4,1),
    "boneMassKg" DECIMAL(3,1),
    "note" TEXT,
    "numbersById" TEXT,
    "numbersByName" TEXT,
    "numbersAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedByName" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiaMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiaFile" (
    "id" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedByName" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "BiaFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BiaMeasurement_patientId_createdAt_idx" ON "BiaMeasurement"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "BiaMeasurement_appointmentId_idx" ON "BiaMeasurement"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "BiaFile_storageName_key" ON "BiaFile"("storageName");

-- CreateIndex
CREATE INDEX "BiaFile_measurementId_idx" ON "BiaFile"("measurementId");

-- AddForeignKey
ALTER TABLE "BiaMeasurement" ADD CONSTRAINT "BiaMeasurement_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiaMeasurement" ADD CONSTRAINT "BiaMeasurement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiaFile" ADD CONSTRAINT "BiaFile_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "BiaMeasurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Rentang angka (spec 3.1): juga diperiksa di server dan formulir; di sini jaring pengaman terakhir.
ALTER TABLE "BiaMeasurement"
  ADD CONSTRAINT bia_body_fat_range CHECK ("bodyFatPercent" IS NULL OR ("bodyFatPercent" >= 2 AND "bodyFatPercent" <= 70)),
  ADD CONSTRAINT bia_muscle_range CHECK ("muscleMassKg" IS NULL OR ("muscleMassKg" >= 5 AND "muscleMassKg" <= 120)),
  ADD CONSTRAINT bia_visceral_range CHECK ("visceralFat" IS NULL OR ("visceralFat" >= 1 AND "visceralFat" <= 59)),
  ADD CONSTRAINT bia_bmr_range CHECK ("bmr" IS NULL OR ("bmr" >= 500 AND "bmr" <= 5000)),
  ADD CONSTRAINT bia_metabolic_age_range CHECK ("metabolicAge" IS NULL OR ("metabolicAge" >= 5 AND "metabolicAge" <= 110)),
  ADD CONSTRAINT bia_water_range CHECK ("bodyWaterPercent" IS NULL OR ("bodyWaterPercent" >= 20 AND "bodyWaterPercent" <= 80)),
  ADD CONSTRAINT bia_bone_range CHECK ("boneMassKg" IS NULL OR ("boneMassKg" >= 0.5 AND "boneMassKg" <= 10)),
  ADD CONSTRAINT bia_void_fields CHECK (
    ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidedByName" IS NULL AND "voidReason" IS NULL)
    OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidedByName" IS NOT NULL AND "voidReason" IS NOT NULL)
  );

ALTER TABLE "BiaFile"
  ADD CONSTRAINT bia_file_size CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
  ADD CONSTRAINT bia_file_void_fields CHECK (
    ("voidedAt" IS NULL AND "voidedById" IS NULL AND "voidedByName" IS NULL AND "voidReason" IS NULL)
    OR ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidedByName" IS NOT NULL AND "voidReason" IS NOT NULL)
  );

-- Hanya satu pengukuran aktif per booking; yang dibatalkan tidak dihitung.
CREATE UNIQUE INDEX "BiaMeasurement_one_active_per_appointment" ON "BiaMeasurement"("appointmentId") WHERE "voidedAt" IS NULL;

-- Angka yang sudah tersimpan tidak bisa diubah setelah booking SELESAI (spec 3.3, keputusan perencana 1).
-- Pembatalan (kolom void*) dan pengisian pertama (numbersAt masih kosong) tetap boleh.
CREATE FUNCTION bia_numbers_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."numbersAt" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "Appointment" WHERE "id" = OLD."appointmentId" AND "status" = 'SELESAI')
     AND (
       NEW."bodyFatPercent" IS DISTINCT FROM OLD."bodyFatPercent"
       OR NEW."muscleMassKg" IS DISTINCT FROM OLD."muscleMassKg"
       OR NEW."visceralFat" IS DISTINCT FROM OLD."visceralFat"
       OR NEW."bmr" IS DISTINCT FROM OLD."bmr"
       OR NEW."metabolicAge" IS DISTINCT FROM OLD."metabolicAge"
       OR NEW."bodyWaterPercent" IS DISTINCT FROM OLD."bodyWaterPercent"
       OR NEW."boneMassKg" IS DISTINCT FROM OLD."boneMassKg"
       OR NEW."note" IS DISTINCT FROM OLD."note"
     ) THEN
    RAISE EXCEPTION 'bia_terkunci: angka BIA milik kunjungan final tidak bisa diubah (%)', OLD."id";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bia_numbers_locked
BEFORE UPDATE ON "BiaMeasurement"
FOR EACH ROW EXECUTE FUNCTION bia_numbers_locked();

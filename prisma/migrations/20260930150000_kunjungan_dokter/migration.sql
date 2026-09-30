-- Rekam medis bagian 1: catatan dokter per kunjungan.
-- Spec: docs/superpowers/specs/2026-09-30-catatan-dokter-kunjungan-design.md bagian 6.

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('DRAF', 'FINAL');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "importantNotes" TEXT,
ADD COLUMN "paperRecordNumber" TEXT;

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'DRAF',
    "subjective" TEXT,
    "physicalExam" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse" INTEGER,
    "temperatureC" DECIMAL(3,1),
    "weightKg" DECIMAL(5,1),
    "heightCm" DECIMAL(5,1),
    "waistCm" DECIMAL(5,1),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "finalizedById" TEXT,
    "finalizedByName" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "appointmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterTreatment" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "area" TEXT,
    "dose" TEXT,
    "performerId" TEXT NOT NULL,
    "performerName" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EncounterTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterAddendum" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_appointmentId_key" ON "Encounter"("appointmentId");
CREATE INDEX "Encounter_status_idx" ON "Encounter"("status");
CREATE INDEX "EncounterTreatment_encounterId_idx" ON "EncounterTreatment"("encounterId");
CREATE INDEX "EncounterAddendum_encounterId_idx" ON "EncounterAddendum"("encounterId");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EncounterTreatment" ADD CONSTRAINT "EncounterTreatment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterAddendum" ADD CONSTRAINT "EncounterAddendum_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rentang tanda vital sama dengan src/lib/encounter.ts (spec bagian 5).
ALTER TABLE "Encounter" ADD CONSTRAINT encounter_vitals_range CHECK (
  ("systolic" IS NULL OR "systolic" BETWEEN 50 AND 260)
  AND ("diastolic" IS NULL OR "diastolic" BETWEEN 30 AND 160)
  AND ("pulse" IS NULL OR "pulse" BETWEEN 30 AND 220)
  AND ("temperatureC" IS NULL OR "temperatureC" BETWEEN 34 AND 42)
  AND ("weightKg" IS NULL OR "weightKg" BETWEEN 20 AND 300)
  AND ("heightCm" IS NULL OR "heightCm" BETWEEN 100 AND 230)
  AND ("waistCm" IS NULL OR "waistCm" BETWEEN 40 AND 200)
);

-- Tensi selalu berpasangan, dan diastolik lebih kecil dari sistolik.
ALTER TABLE "Encounter" ADD CONSTRAINT encounter_blood_pressure_pair CHECK (
  ("systolic" IS NULL) = ("diastolic" IS NULL)
  AND ("systolic" IS NULL OR "diastolic" < "systolic")
);

-- Catatan final selalu punya penilaian dan penanda siapa/kapan (spec R13).
ALTER TABLE "Encounter" ADD CONSTRAINT encounter_final_complete CHECK (
  "status" = 'DRAF'
  OR (
    "finalizedAt" IS NOT NULL
    AND "finalizedById" IS NOT NULL
    AND "finalizedByName" IS NOT NULL
    AND btrim(coalesce("assessment", '')) <> ''
  )
);

ALTER TABLE "EncounterAddendum" ADD CONSTRAINT encounter_addendum_text CHECK (btrim("text") <> '');

-- Penguncian rekam medis (Permenkes 24/2022, PRD F12). Aplikasi sudah memakai
-- pembaruan bersyarat; trigger ini jaring terakhir untuk bug, skrip, dan SQL
-- langsung. Hanya pemilik tabel yang bisa mematikannya lewat DDL (lihat
-- tests/purge-encounters.ts, dipakai khusus basis data uji). Semua pesan
-- diawali "rekam_medis_terkunci" agar server bisa menerjemahkannya.
CREATE FUNCTION encounter_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'FINAL' THEN
    RAISE EXCEPTION 'rekam_medis_terkunci: kunjungan % sudah final', OLD."id";
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER encounter_locked
BEFORE UPDATE OR DELETE ON "Encounter"
FOR EACH ROW EXECUTE FUNCTION encounter_locked();

CREATE FUNCTION encounter_treatment_locked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "EncounterStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    -- Induk yang sudah tidak ada berarti cascade dari draf yang dibuang:
    -- kunjungan final tidak pernah bisa dihapus (encounter_locked).
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = OLD."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: treatment kunjungan % sudah final', OLD."encounterId";
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = NEW."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: treatment kunjungan % sudah final', NEW."encounterId";
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER encounter_treatment_locked
BEFORE INSERT OR UPDATE OR DELETE ON "EncounterTreatment"
FOR EACH ROW EXECUTE FUNCTION encounter_treatment_locked();

CREATE FUNCTION encounter_addendum_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "EncounterStatus";
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = NEW."encounterId";
    IF parent_status IS DISTINCT FROM 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: adendum hanya untuk kunjungan final';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'rekam_medis_terkunci: adendum tidak bisa diubah atau dihapus';
END;
$$;

CREATE TRIGGER encounter_addendum_guard
BEFORE INSERT OR UPDATE OR DELETE ON "EncounterAddendum"
FOR EACH ROW EXECUTE FUNCTION encounter_addendum_guard();

-- TRUNCATE melewati trigger per baris, jadi ditolak sendiri.
CREATE FUNCTION medical_record_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rekam_medis_terkunci: tabel % tidak boleh dikosongkan', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER encounter_no_truncate BEFORE TRUNCATE ON "Encounter"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();
CREATE TRIGGER encounter_treatment_no_truncate BEFORE TRUNCATE ON "EncounterTreatment"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();
CREATE TRIGGER encounter_addendum_no_truncate BEFORE TRUNCATE ON "EncounterAddendum"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();

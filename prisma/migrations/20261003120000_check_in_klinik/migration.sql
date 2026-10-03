-- Rekam medis bagian 2: check-in klinik (NIK, pasien rangkap, food recall H-1).
-- Spec: docs/superpowers/specs/2026-10-03-check-in-klinik-design.md bagian 6.
--
-- Hanya menambah: deploy.sh menjalankan migrasi sebelum build, dan rilis lama
-- tetap melayani selama build. Semua kolom baru boleh kosong.

-- CreateEnum
CREATE TYPE "NikMissingReason" AS ENUM ('WARGA_ASING', 'ANAK', 'LUPA_KTP');

-- CreateEnum
CREATE TYPE "FoodRecallStatus" AS ENUM ('DITAWARKAN', 'DIISI');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "checkedInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "nik" TEXT,
ADD COLUMN     "nikMissingReason" "NikMissingReason";

-- CreateTable
CREATE TABLE "FoodRecall" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "recallDate" DATE NOT NULL,
    "status" "FoodRecallStatus" NOT NULL DEFAULT 'DITAWARKAN',
    "entries" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3),
    "completedByStaffId" TEXT,
    "completedByName" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodRecall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodRecall_appointmentId_key" ON "FoodRecall"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nik_key" ON "Patient"("nik");

-- CreateIndex
CREATE INDEX "Patient_mergedIntoId_idx" ON "Patient"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodRecall" ADD CONSTRAINT "FoodRecall_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- NIK: tepat 16 angka, tidak bersamaan dengan alasan "Belum ada NIK".
ALTER TABLE "Patient" ADD CONSTRAINT "patient_nik_format" CHECK ("nik" IS NULL OR "nik" ~ '^[0-9]{16}$');
ALTER TABLE "Patient" ADD CONSTRAINT "patient_nik_or_reason" CHECK ("nik" IS NULL OR "nikMissingReason" IS NULL);
ALTER TABLE "Patient" ADD CONSTRAINT "patient_not_merged_into_self" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");

-- Food recall ikut terkunci begitu catatan dokter kunjungannya final (spec 5.4),
-- seperti encounter_treatment_locked: tidak bisa ditambah, diubah, atau dihapus.
CREATE FUNCTION food_recall_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF EXISTS (SELECT 1 FROM "Encounter" WHERE "appointmentId" = OLD."appointmentId" AND "status" = 'FINAL') THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: food recall booking % sudah final', OLD."appointmentId";
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF EXISTS (SELECT 1 FROM "Encounter" WHERE "appointmentId" = NEW."appointmentId" AND "status" = 'FINAL') THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: food recall booking % sudah final', NEW."appointmentId";
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER food_recall_locked
BEFORE INSERT OR UPDATE OR DELETE ON "FoodRecall"
FOR EACH ROW EXECUTE FUNCTION food_recall_locked();

CREATE TRIGGER food_recall_no_truncate BEFORE TRUNCATE ON "FoodRecall"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();

-- CreateEnum
CREATE TYPE "DispensingSource" AS ENUM ('APOTEKER', 'DOKTER');

-- AlterTable
ALTER TABLE "Dispensing" ADD COLUMN     "source" "DispensingSource" NOT NULL DEFAULT 'APOTEKER';

-- AlterTable
ALTER TABLE "DispensingLine" ADD COLUMN     "billedQuantity" INTEGER,
ADD COLUMN     "billingNote" TEXT,
ADD COLUMN     "prescriptionId" TEXT;

-- CreateTable
CREATE TABLE "EncounterPrescription" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "usage" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EncounterPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncounterPrescription_encounterId_idx" ON "EncounterPrescription"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "DispensingLine_prescriptionId_key" ON "DispensingLine"("prescriptionId");

-- AddForeignKey
ALTER TABLE "EncounterPrescription" ADD CONSTRAINT "EncounterPrescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterPrescription" ADD CONSTRAINT "EncounterPrescription_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispensingLine" ADD CONSTRAINT "DispensingLine_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "EncounterPrescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Nilai resep dan penagihan (spec resep dokter 2). Tiap ekspresi tidak pernah NULL.
ALTER TABLE "EncounterPrescription" ADD CONSTRAINT encounter_prescription_values CHECK ("quantity" > 0 AND btrim("usage") <> '');
ALTER TABLE "DispensingLine" ADD CONSTRAINT dispensing_line_billing CHECK (
  "billedQuantity" IS NULL OR ("billedQuantity" >= 0 AND "billedQuantity" < "quantity" AND "billingNote" IS NOT NULL)
);

-- Resep terkunci bersama kunjungannya, sama seperti treatment (migrasi kunjungan_dokter).
CREATE FUNCTION encounter_prescription_locked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "EncounterStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = OLD."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: resep kunjungan % sudah final', OLD."encounterId";
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = NEW."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: resep kunjungan % sudah final', NEW."encounterId";
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER encounter_prescription_locked
BEFORE INSERT OR UPDATE OR DELETE ON "EncounterPrescription"
FOR EACH ROW EXECUTE FUNCTION encounter_prescription_locked();

CREATE TRIGGER encounter_prescription_no_truncate BEFORE TRUNCATE ON "EncounterPrescription"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();

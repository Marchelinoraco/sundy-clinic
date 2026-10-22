-- Paket di resep dokter (spec vital perawat PR1, PR4). Hanya menambah.
CREATE TABLE "EncounterPackage" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "contents" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EncounterPackage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EncounterPackage_packageId_idx" ON "EncounterPackage"("packageId");

CREATE UNIQUE INDEX "EncounterPackage_encounterId_packageId_key" ON "EncounterPackage"("encounterId", "packageId");

ALTER TABLE "EncounterPackage" ADD CONSTRAINT "EncounterPackage_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncounterPackage" ADD CONSTRAINT "EncounterPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TreatmentPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Paket terkunci bersama kunjungannya, sama seperti resep (migrasi resep_dokter).
CREATE FUNCTION encounter_package_locked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status "EncounterStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = OLD."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: paket kunjungan % sudah final', OLD."encounterId";
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "status" INTO parent_status FROM "Encounter" WHERE "id" = NEW."encounterId";
    IF parent_status = 'FINAL' THEN
      RAISE EXCEPTION 'rekam_medis_terkunci: paket kunjungan % sudah final', NEW."encounterId";
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER encounter_package_locked
BEFORE INSERT OR UPDATE OR DELETE ON "EncounterPackage"
FOR EACH ROW EXECUTE FUNCTION encounter_package_locked();

CREATE TRIGGER encounter_package_no_truncate BEFORE TRUNCATE ON "EncounterPackage"
FOR EACH STATEMENT EXECUTE FUNCTION medical_record_no_truncate();

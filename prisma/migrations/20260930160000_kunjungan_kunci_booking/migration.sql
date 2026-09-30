-- Rekam medis bagian 1 (hasil review): kunjungan membaca pasien, jadwal,
-- cabang, tenaga, dan layanan dari booking-nya, tidak menyalinnya (spec
-- bagian 6). Agar catatan final benar-benar tidak bisa diubah lewat SQL
-- langsung (spec bagian 1), kolom itu ikut terkunci begitu kunjungannya final.
-- Satu-satunya perubahan status yang diizinkan adalah HADIR -> SELESAI, yang
-- dilakukan finalisasi sendiri di transaksi yang sama.
CREATE FUNCTION appointment_record_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Encounter" WHERE "appointmentId" = OLD."id" AND "status" = 'FINAL')
     AND (
       NEW."code" IS DISTINCT FROM OLD."code"
       OR NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."patientId" IS DISTINCT FROM OLD."patientId"
       OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
       OR NEW."staffId" IS DISTINCT FROM OLD."staffId"
       OR NEW."serviceId" IS DISTINCT FROM OLD."serviceId"
       OR NEW."startAt" IS DISTINCT FROM OLD."startAt"
       OR NEW."endAt" IS DISTINCT FROM OLD."endAt"
       OR (NEW."status" IS DISTINCT FROM OLD."status" AND NOT (OLD."status" = 'HADIR' AND NEW."status" = 'SELESAI'))
     ) THEN
    RAISE EXCEPTION 'rekam_medis_terkunci: booking % milik kunjungan final', OLD."id";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointment_record_locked
BEFORE UPDATE ON "Appointment"
FOR EACH ROW EXECUTE FUNCTION appointment_record_locked();

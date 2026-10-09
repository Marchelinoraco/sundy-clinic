-- Pemicu angka BIA yang lebih ketat (hasil tinjauan akhir hasil BIA). Hanya mengganti isi fungsi; tidak ada tabel atau kolom berubah,
-- sehingga rilis sebelumnya tetap berjalan dan `deploy.sh kembali` aman.
--
-- Tambahan dibanding migrasi hasil_bia:
--   1. Setelah booking SELESAI, numbersAt dan pengisi angka (numbersById/numbersByName) juga terkunci. Tanpa ini, lewat SQL langsung
--      numbersAt bisa dikosongkan dulu supaya angka dianggap "belum pernah diisi", lalu diubah.
--   2. Pengukuran yang sudah dibatalkan tidak bisa dibuka lagi (voidedAt tidak boleh kembali kosong), kapan pun.
CREATE OR REPLACE FUNCTION bia_numbers_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."voidedAt" IS NOT NULL AND NEW."voidedAt" IS NULL THEN
    RAISE EXCEPTION 'bia_terkunci: pembatalan pengukuran BIA tidak bisa dibuka lagi (%)', OLD."id";
  END IF;
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
       OR NEW."numbersAt" IS DISTINCT FROM OLD."numbersAt"
       OR NEW."numbersById" IS DISTINCT FROM OLD."numbersById"
       OR NEW."numbersByName" IS DISTINCT FROM OLD."numbersByName"
     ) THEN
    RAISE EXCEPTION 'bia_terkunci: angka BIA milik kunjungan final tidak bisa diubah (%)', OLD."id";
  END IF;
  RETURN NEW;
END;
$$;

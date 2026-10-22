-- Pelaksana treatment dipilih resepsionis di tagihan, bukan dokter (spec aturan pakai PL1, PL4). Hanya melonggarkan kolom:
-- kunjungan lama tetap membawa pelaksananya.
ALTER TABLE "EncounterTreatment" ALTER COLUMN "performerId" DROP NOT NULL,
  ALTER COLUMN "performerName" DROP NOT NULL;

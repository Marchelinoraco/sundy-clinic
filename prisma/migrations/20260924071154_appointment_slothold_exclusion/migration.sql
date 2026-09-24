-- Exclusion constraint: jaminan anti-bentrok yang sesungguhnya.
-- Membutuhkan ekstensi btree_gist agar operator "=" pada kolom teks (staffId)
-- dapat dipakai berdampingan dengan operator jangkauan "&&" dalam satu
-- indeks GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Kolom startAt/endAt bertipe "timestamp without time zone" (lihat
-- prisma/schema.prisma: DateTime tanpa @db.Timestamptz). tstzrange()
-- akan memaksa cast implisit timestamp -> timestamptz, dan cast itu
-- bergantung setting TimeZone sesi sehingga digolongkan STABLE, bukan
-- IMMUTABLE — persis yang ditolak PostgreSQL di dalam ekspresi indeks
-- GiST (error 42P17). tsrange() dipakai sebagai gantinya karena cocok
-- langsung dengan tipe kolom tanpa cast sama sekali. Ini aman karena
-- seluruh DateTime di aplikasi ini disimpan sebagai instan UTC menurut
-- konvensi tetap (lihat PRD bagian 9), bukan nilai yang bergantung zona
-- waktu sesi.
ALTER TABLE "Appointment" ADD CONSTRAINT appointment_no_overlap
EXCLUDE USING gist (
  "staffId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
) WHERE (status IN ('MENUNGGU_KONFIRMASI', 'TERKONFIRMASI', 'HADIR'));

-- Berlaku tanpa syarat pada setiap baris SlotHold (tanpa WHERE "expiresAt" >
-- now(), yang juga akan ditolak karena now() bukan IMMUTABLE).
-- Konsekuensinya sudah dicatat di PRD: hold yang kedaluwarsa tapi belum
-- dihapus tetap menghalangi baris baru sampai baris lamanya benar-benar
-- dihapus — pembersihan hold kedaluwarsa adalah pekerjaan Plan 3b.
ALTER TABLE "SlotHold" ADD CONSTRAINT slot_hold_no_overlap
EXCLUDE USING gist (
  "staffId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
);

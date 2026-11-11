-- Paket lama dari Kluto (spec docs/superpowers/specs/2026-11-11-paket-lama-kluto-design.md bagian 3).
-- Hanya menambah kolom dan melonggarkan purchaseLineId; semua paket yang ada menjadi TAGIHAN.
ALTER TABLE "PatientPackage"
  ADD COLUMN "source" "PatientPackageSource" NOT NULL DEFAULT 'TAGIHAN',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "priorVisits" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "purchaseLineId" DROP NOT NULL;

-- TAGIHAN: lahir dari baris tagihan pembelian. KLUTO: tanpa tagihan, harga 0, tanpa batas waktu (9999-12-31).
ALTER TABLE "PatientPackage" ADD CONSTRAINT "patient_package_source" CHECK (
  ("source" = 'TAGIHAN' AND "purchaseLineId" IS NOT NULL AND "note" IS NULL AND "priorVisits" = 0)
  OR ("source" = 'KLUTO' AND "purchaseLineId" IS NULL AND "price" = 0 AND "expiresOn" = DATE '9999-12-31')
);
ALTER TABLE "PatientPackage" ADD CONSTRAINT "patient_package_note" CHECK ("note" IS NULL OR char_length("note") <= 200);
ALTER TABLE "PatientPackage" ADD CONSTRAINT "patient_package_prior_visits" CHECK ("priorVisits" BETWEEN 0 AND 1000);

-- Buku sesi: PAKAI_KLUTO = sesi terpakai di Kluto (negatif); KOREKSI_KLUTO = koreksi sisa (bukan nol, beralasan).
ALTER TABLE "PackageSessionEntry" DROP CONSTRAINT "package_entry_delta";
ALTER TABLE "PackageSessionEntry" ADD CONSTRAINT "package_entry_delta" CHECK (
  ("kind" = 'BELI' AND "delta" > 0)
  OR ("kind" = 'PAKAI' AND "delta" < 0)
  OR ("kind" = 'BATAL_PAKAI' AND "delta" > 0)
  OR ("kind" = 'BATAL_PAKET' AND "delta" <= 0)
  OR ("kind" = 'PERPANJANG' AND "delta" = 0 AND "previousExpiresOn" IS NOT NULL AND "newExpiresOn" IS NOT NULL AND "reason" IS NOT NULL AND "reason" <> '')
  OR ("kind" = 'PAKAI_KLUTO' AND "delta" < 0)
  OR ("kind" = 'KOREKSI_KLUTO' AND "delta" <> 0 AND "reason" IS NOT NULL AND "reason" <> '')
);

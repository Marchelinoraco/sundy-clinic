-- Rencana kunjungan paket dan pengingat H-1 (spec jadwal paket, 22 Okt 2026). Hanya menambah; data lama diisi menurut JP15.
-- AlterTable
ALTER TABLE "PatientPackage" ADD COLUMN     "nextVisitOn" DATE,
ADD COLUMN     "visitIntervalDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "PatientPackageItem" ADD COLUMN     "perVisit" INTEGER;

-- AlterTable
ALTER TABLE "TreatmentPackage" ADD COLUMN     "visitIntervalDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "TreatmentPackageItem" ADD COLUMN     "perVisit" INTEGER;

-- CreateTable
CREATE TABLE "PackageVisitReminder" (
    "id" TEXT NOT NULL,
    "patientPackageId" TEXT NOT NULL,
    "visitOn" DATE NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,

    CONSTRAINT "PackageVisitReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageVisitReminder_patientPackageId_visitOn_key" ON "PackageVisitReminder"("patientPackageId", "visitOn");

-- AddForeignKey
ALTER TABLE "PackageVisitReminder" ADD CONSTRAINT "PackageVisitReminder_patientPackageId_fkey" FOREIGN KEY ("patientPackageId") REFERENCES "PatientPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Isian awal katalog (JP15): barang dibagi rata dengan sesi treatment terbanyak di paket, atau semuanya bila tanpa treatment.
UPDATE "TreatmentPackageItem" g
SET "perVisit" = CEIL(g."sessions"::numeric / GREATEST(1, COALESCE((
  SELECT MAX(t."sessions") FROM "TreatmentPackageItem" t WHERE t."packageId" = g."packageId" AND t."serviceId" IS NOT NULL
), 0)))::int
WHERE g."itemId" IS NOT NULL;

-- Isian awal paket customer (JP15): dari sisa, bukan jumlah awal.
WITH rem AS (
  SELECT i."id", i."patientPackageId", i."serviceId",
         COALESCE((SELECT SUM(e."delta") FROM "PackageSessionEntry" e WHERE e."patientPackageItemId" = i."id"), 0) AS remaining
  FROM "PatientPackageItem" i
)
UPDATE "PatientPackageItem" p
SET "perVisit" = LEAST(p."sessions", GREATEST(1, CEIL(r.remaining::numeric / GREATEST(1, COALESCE((
  SELECT MAX(t.remaining) FROM rem t WHERE t."patientPackageId" = r."patientPackageId" AND t."serviceId" IS NOT NULL
), 0)))::int))
FROM rem r
WHERE r."id" = p."id" AND p."itemId" IS NOT NULL;

-- Kunjungan berikutnya = pemakaian terakhir di tagihan final (atau tanggal beli) + 7 hari, untuk paket aktif yang masih bersisa.
UPDATE "PatientPackage" pp
SET "nextVisitOn" = COALESCE((
  SELECT MAX(((inv."finalizedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Makassar')::date)
  FROM "PackageSessionEntry" e
  JOIN "PatientPackageItem" it ON it."id" = e."patientPackageItemId"
  JOIN "InvoiceLine" l ON l."id" = e."invoiceLineId"
  JOIN "Invoice" inv ON inv."id" = l."invoiceId"
  WHERE it."patientPackageId" = pp."id" AND e."kind" = 'PAKAI' AND inv."status" = 'FINAL'
), pp."startsOn") + 7
WHERE pp."status" = 'AKTIF'
  AND (SELECT COALESCE(SUM(e."delta"), 0) FROM "PackageSessionEntry" e JOIN "PatientPackageItem" it ON it."id" = e."patientPackageItemId" WHERE it."patientPackageId" = pp."id") > 0;

-- Jarak 1–365 hari (JP16).
ALTER TABLE "TreatmentPackage" ADD CONSTRAINT "treatment_package_visit_interval" CHECK ("visitIntervalDays" BETWEEN 1 AND 365);
ALTER TABLE "PatientPackage" ADD CONSTRAINT "patient_package_visit_interval" CHECK ("visitIntervalDays" BETWEEN 1 AND 365);

-- Barang wajib jumlah per kunjungan 1..jumlahnya; treatment tanpa (JP2, JP16). IS NOT NULL ditulis tegas: CHECK yang NULL dianggap lulus.
ALTER TABLE "TreatmentPackageItem" DROP CONSTRAINT "treatment_package_item_shape";
ALTER TABLE "TreatmentPackageItem" ADD CONSTRAINT "treatment_package_item_shape" CHECK (
  ("serviceId" IS NOT NULL AND "itemId" IS NULL AND "sessions" BETWEEN 1 AND 100 AND "perVisit" IS NULL)
  OR ("serviceId" IS NULL AND "itemId" IS NOT NULL AND "sessions" BETWEEN 1 AND 1000 AND "perVisit" IS NOT NULL AND "perVisit" BETWEEN 1 AND "sessions")
);
ALTER TABLE "PatientPackageItem" DROP CONSTRAINT "patient_package_item_shape";
ALTER TABLE "PatientPackageItem" ADD CONSTRAINT "patient_package_item_shape" CHECK (
  ("serviceId" IS NOT NULL AND "itemId" IS NULL AND "sessions" BETWEEN 1 AND 100 AND "perVisit" IS NULL)
  OR ("serviceId" IS NULL AND "itemId" IS NOT NULL AND "unit" IS NOT NULL AND "sessions" BETWEEN 1 AND 1000 AND "perVisit" IS NOT NULL AND "perVisit" BETWEEN 1 AND "sessions")
);

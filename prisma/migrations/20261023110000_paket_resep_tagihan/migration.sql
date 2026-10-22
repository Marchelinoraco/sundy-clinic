-- Paket dari dokter di tagihan dan alasan tidak dibeli (spec vital perawat PR2, PR3). Hanya menambah.
ALTER TABLE "InvoiceLine" ADD COLUMN "encounterPackageId" TEXT;

CREATE TABLE "EncounterPackageDecline" (
    "id" TEXT NOT NULL,
    "encounterPackageId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterPackageDecline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EncounterPackageDecline_encounterPackageId_key" ON "EncounterPackageDecline"("encounterPackageId");

CREATE UNIQUE INDEX "InvoiceLine_invoiceId_encounterPackageId_key" ON "InvoiceLine"("invoiceId", "encounterPackageId");

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_encounterPackageId_fkey" FOREIGN KEY ("encounterPackageId") REFERENCES "EncounterPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EncounterPackageDecline" ADD CONSTRAINT "EncounterPackageDecline_encounterPackageId_fkey" FOREIGN KEY ("encounterPackageId") REFERENCES "EncounterPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Alasan wajib 2–200 karakter (spec vital perawat PR3).
ALTER TABLE "EncounterPackageDecline" ADD CONSTRAINT encounter_package_decline_reason CHECK (char_length(btrim("reason")) BETWEEN 2 AND 200);

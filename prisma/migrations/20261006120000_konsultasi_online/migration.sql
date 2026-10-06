-- Konsultasi online: booking berkanal ONLINE tanpa slot, berdasarkan rentang waktu luang customer.
-- Spec: docs/superpowers/specs/2026-10-06-konsultasi-online-design.md bagian 8.
--
-- Satu-satunya yang dihapus adalah aturan appointment_no_overlap, dibuat ulang di bawah dalam
-- migrasi yang sama (satu transaksi implisit). Rilis lama tetap aman selama deploy: ia tidak
-- pernah membuat booking online, dan untuk booking klinik aturan barunya sama persis.


-- CreateEnum
CREATE TYPE "AppointmentChannel" AS ENUM ('KLINIK', 'ONLINE');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "channel" "AppointmentChannel" NOT NULL DEFAULT 'KLINIK',
ADD COLUMN     "servicePrice" INTEGER;

-- CreateTable
CREATE TABLE "ContactWindow" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAttempt" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,

    CONSTRAINT "ContactAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactWindow_appointmentId_startAt_idx" ON "ContactWindow"("appointmentId", "startAt");

-- CreateIndex
CREATE INDEX "ContactAttempt_appointmentId_at_idx" ON "ContactAttempt"("appointmentId", "at");

-- AddForeignKey
ALTER TABLE "ContactWindow" ADD CONSTRAINT "ContactWindow_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Booking online berjenis konsultasi dan membawa harga layanan; booking klinik tidak.
ALTER TABLE "Appointment" ADD CONSTRAINT appointment_online_consultation CHECK (
  ("channel" = 'ONLINE' AND "type" = 'KONSULTASI' AND "servicePrice" IS NOT NULL)
  OR ("channel" = 'KLINIK' AND "servicePrice" IS NULL)
);

ALTER TABLE "ContactWindow" ADD CONSTRAINT contact_window_range CHECK ("endAt" > "startAt");

-- Penjaga anti-bentrok hanya untuk kunjungan klinik (spec 3.7). Syarat status tetap sama.
ALTER TABLE "Appointment" DROP CONSTRAINT appointment_no_overlap;
ALTER TABLE "Appointment" ADD CONSTRAINT appointment_no_overlap
EXCLUDE USING gist (
  "staffId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
) WHERE ("channel" = 'KLINIK' AND status IN ('MENUNGGU_KONFIRMASI', 'TERKONFIRMASI', 'HADIR'));

-- Layanan Konsultasi Online: nonaktif dan berharga 0 sampai pemilik mengaturnya di halaman Layanan
-- (spec 3.3). Dibuat hanya bila Konsultasi Dokter sudah ada (database baru memakai seed.ts).
INSERT INTO "Service" (
  "id", "slug", "name", "description", "promoPrice", "durationMin", "isSignature", "isActive",
  "sortOrder", "requiresDoctor", "categoryId", "createdAt", "updatedAt"
)
SELECT
  'konsultasi_online_svc', 'konsultasi-online', 'Konsultasi Online',
  'Konsultasi dokter lewat WhatsApp (telepon atau video).',
  0, 30, false, false, 99, true, "categoryId", NOW(), NOW()
FROM "Service"
WHERE "slug" = 'konsultasi-dokter'
ON CONFLICT ("slug") DO NOTHING;

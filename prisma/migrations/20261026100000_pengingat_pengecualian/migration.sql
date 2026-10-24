-- Pengingat treatment (spec pengingat treatment PT3): layanan BIA di produksi dan treatment intim tidak diingatkan.
-- Daftar lengkapnya NO_RETURN_REMINDER_SLUGS di src/lib/treatment-reminder.ts. Hanya mengubah nilai awal yang
-- ditanam migrasi 20261026090000 (keduanya dirilis bersama).
UPDATE "Service" SET "returnReminderDays" = NULL
  WHERE "slug" IN ('bia', 'konsultasi-bia', 'hifu-miss-v');

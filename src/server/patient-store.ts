import type { Gender, Patient, Prisma, PrismaClient } from "@prisma/client";
import { formatMedicalRecordNumber } from "@/lib/medical-record-number";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Mengalokasikan nomor urut berikutnya untuk tahun ini secara atomik.
 *
 * INSERT ... ON CONFLICT DO UPDATE adalah satu pernyataan tunggal di
 * PostgreSQL — baris dikunci selama pernyataan itu berjalan, sehingga dua
 * panggilan bersamaan tidak akan pernah membaca nilai yang sama sebelum
 * menulis. Di dalam transaksi, nomor ikut batal bila transaksi batal.
 */
async function nextMedicalRecordSequence(db: Db, year: number): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "PatientNumberCounter" ("year", "value")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "PatientNumberCounter"."value" + 1
    RETURNING "value"
  `;
  return rows[0].value;
}

/**
 * Membuat pasien dengan nomor rekam medis baru. Modul biasa (bukan
 * "use server"): pemanggil wajib sudah memeriksa hak akses dan memvalidasi
 * input, karena nomor urut yang sudah diambil tidak pernah dikembalikan.
 */
export async function insertPatient(
  db: Db,
  data: {
    name: string;
    whatsapp: string;
    birthDate: Date | null;
    gender?: Gender | null;
    occupation?: string | null;
    address?: string | null;
  },
): Promise<Patient> {
  const year = new Date().getFullYear();
  const sequence = await nextMedicalRecordSequence(db, year);
  return db.patient.create({
    data: { medicalRecordNumber: formatMedicalRecordNumber(year, sequence), ...data },
  });
}

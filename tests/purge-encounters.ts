import type { PrismaClient } from "@prisma/client";

// BiaFile lalu BiaMeasurement lebih dulu: keduanya merujuk booking. FoodRecall sebelum kunjungan: trigger kuncinya membaca status kunjungan.
const TABLES = ['"BiaFile"', '"BiaMeasurement"', '"FoodRecall"', '"EncounterAddendum"', '"EncounterTreatment"', '"Encounter"'] as const;

/**
 * Menghapus semua kunjungan di basis data UJI. Kunjungan final dikunci trigger
 * (migrasi kunjungan_dokter), jadi trigger buatan kita dimatikan sementara di
 * dalam satu transaksi: bila penghapusan gagal, trigger tetap menyala. Hanya
 * pemilik tabel yang bisa melakukannya, dan aplikasi tidak pernah memakainya.
 */
export async function purgeEncounters(db: PrismaClient): Promise<void> {
  await db.$transaction([
    ...TABLES.map((table) => db.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER USER`)),
    ...TABLES.map((table) => db.$executeRawUnsafe(`DELETE FROM ${table}`)),
    ...TABLES.map((table) => db.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER USER`)),
  ]);
}

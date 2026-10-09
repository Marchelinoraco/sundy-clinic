import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Berkas hasil BIA di disk (spec hasil BIA 4.2). Folder dasarnya `PATIENT_FILES_DIR` (bawaan /www/sundy-files),
 * di luar folder rilis dan sudah masuk backup harian. Nama di disk selalu acak; nama asli hanya ada di basis data.
 */
export const BIA_STORAGE_NAME = /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|pdf)$/;
const EXTENSIONS = new Set(["jpg", "png", "webp", "heic", "pdf"]);

export function patientFilesDir(): string {
  return process.env.PATIENT_FILES_DIR || "/www/sundy-files";
}

function pathOf(storageName: string): string {
  if (!BIA_STORAGE_NAME.test(storageName)) throw new Error("Nama berkas BIA tidak sah.");
  return path.join(patientFilesDir(), "bia", storageName);
}

/** Menulis ke nama sementara lalu memindahkannya, sehingga berkas yang terbaca selalu utuh. Mengembalikan nama relatif. */
export async function writeBiaFile(bytes: Uint8Array, ext: string, now: Date = new Date()): Promise<string> {
  if (!EXTENSIONS.has(ext)) throw new Error("Ekstensi berkas BIA tidak sah.");
  const storageName = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  const target = pathOf(storageName);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return storageName;
}

export async function readBiaFile(storageName: string): Promise<Buffer> {
  return readFile(pathOf(storageName));
}

/** Hanya untuk membatalkan penulisan yang gagal di tengah jalan; aplikasi tidak pernah menghapus berkas yang sudah tercatat. */
export async function removeBiaFile(storageName: string): Promise<void> {
  await rm(pathOf(storageName), { force: true });
}

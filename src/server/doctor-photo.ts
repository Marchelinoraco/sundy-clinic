import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { UserFacingError } from "@/lib/action-result";
import { DOCTOR_PHOTO_MAX_BYTES, DOCTOR_PHOTO_MAX_SIDE, DOCTOR_PHOTO_MIN_SIDE, DOCTOR_PHOTO_NAME, detectPhotoKind } from "@/lib/doctor-profile";
import { patientFilesDir } from "@/server/bia-storage";

/** Pengolahan dan penyimpanan foto dokter di halaman publik (spec profil dokter 4). */
const MAX_INPUT_PIXELS = 40_000_000;

export type ProcessedPhoto = { bytes: Buffer; width: number; height: number; fingerprint: string };

/**
 * Foto kiriman pengguna diubah menjadi WebP buatan `sharp`: diputar sesuai EXIF, disusutkan, dan tanpa metadata apa pun
 * (lokasi GPS ikut terbuang). Berkas kiriman tidak pernah disajikan apa adanya.
 */
export async function processDoctorPhoto(input: Uint8Array): Promise<ProcessedPhoto> {
  if (input.length === 0) throw new UserFacingError("Berkas kosong.");
  if (input.length > DOCTOR_PHOTO_MAX_BYTES) throw new UserFacingError("Foto terlalu besar (maks. 8 MB).");
  if (!detectPhotoKind(input)) throw new UserFacingError("Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.");

  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    const rawWidth = meta.width ?? 0;
    const rawHeight = meta.height ?? 0;
    if (rawWidth === 0 || rawHeight === 0) throw new UserFacingError("Foto tidak bisa dibaca sebagai gambar.");
    if (rawWidth * rawHeight > MAX_INPUT_PIXELS) throw new UserFacingError("Ukuran foto (piksel) terlalu besar.");
    // Orientasi 5–8 menukar lebar dan tinggi saat ditampilkan; ukuran minimal dinilai dari yang terlihat.
    const swapped = (meta.orientation ?? 1) >= 5;
    const shortSide = Math.min(swapped ? rawHeight : rawWidth, swapped ? rawWidth : rawHeight);
    if (shortSide < DOCTOR_PHOTO_MIN_SIDE) throw new UserFacingError(`Foto terlalu kecil. Sisi terpendek minimal ${DOCTOR_PHOTO_MIN_SIDE} px.`);

    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: DOCTOR_PHOTO_MAX_SIDE, height: DOCTOR_PHOTO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height, fingerprint: createHash("sha256").update(data).digest("hex").slice(0, 8) };
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message)) throw new UserFacingError("Ukuran foto (piksel) terlalu besar.");
    throw new UserFacingError("Foto tidak bisa dibaca sebagai gambar.");
  }
}

export function doctorPhotoDir(): string {
  return path.join(patientFilesDir(), "dokter");
}

function fileOf(name: string): string {
  if (!DOCTOR_PHOTO_NAME.test(name)) throw new Error("Nama berkas foto dokter tidak sah.");
  return path.join(doctorPhotoDir(), name);
}

/** Menulis ke nama sementara lalu memindahkannya, sehingga berkas yang terbaca selalu utuh. Mengembalikan nama berkas. */
export async function writeDoctorPhoto(staffId: string, photo: ProcessedPhoto): Promise<string> {
  const name = `${staffId}-${photo.fingerprint}.webp`;
  const target = fileOf(name);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, photo.bytes, { mode: 0o644 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return name;
}

export async function readDoctorPhotoFile(name: string): Promise<Buffer> {
  return readFile(fileOf(name));
}

export async function removeDoctorPhotoFile(name: string): Promise<void> {
  await rm(fileOf(name), { force: true });
}

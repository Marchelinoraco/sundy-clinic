import { DOCTOR_PHOTO_MAX_BYTES } from "@/lib/doctor-profile";

export type PhotoResult = { ok: true; photoUrl: string } | { ok: false; error: string };

/** Satu foto per permintaan ke rute unggah panel (spec profil dokter 6, spec layanan situs 5.3). */
export async function postPhoto(endpoint: string, fields: Record<string, string>, file: File): Promise<PhotoResult> {
  if (file.size > DOCTOR_PHOTO_MAX_BYTES) return { ok: false, error: "Foto terlalu besar (maks. 8 MB)." };
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.set("file", file);
  try {
    const response = await fetch(endpoint, { method: "POST", body });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; photoUrl?: string; error?: string } | null;
    if (response.ok && data?.ok && data.photoUrl) return { ok: true, photoUrl: data.photoUrl };
    return { ok: false, error: data?.error ?? "Gagal mengunggah. Coba lagi." };
  } catch {
    return { ok: false, error: "Koneksi terputus. Coba lagi." };
  }
}

import { BIA_MAX_BYTES } from "@/lib/bia";

export type SendResult = { name: string; ok: true } | { name: string; ok: false; error: string };

/** Satu berkas per permintaan (spec hasil BIA 4.3), sehingga tiap permintaan di bawah batas nginx. */
export async function sendBiaFile(appointmentId: string, file: File): Promise<SendResult> {
  if (file.size > BIA_MAX_BYTES) return { name: file.name, ok: false, error: "Berkas terlalu besar (maks. 10 MB)." };
  const body = new FormData();
  body.set("appointmentId", appointmentId);
  body.set("file", file);
  try {
    const response = await fetch("/admin/bia/unggah", { method: "POST", body });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (response.ok && data?.ok) return { name: file.name, ok: true };
    return { name: file.name, ok: false, error: data?.error ?? "Gagal mengunggah. Coba lagi." };
  } catch {
    return { name: file.name, ok: false, error: "Koneksi terputus. Coba lagi." };
  }
}

import { UserFacingError } from "@/lib/action-result";
import { getCurrentStaff } from "@/server/session";

export type RegistrationAccess = "open" | "staff-preview" | "closed";

/**
 * Siapa yang boleh memakai pendaftaran online /daftar. Diatur lewat REGISTRATION_CLOSED di shared/.env, berlaku setelah
 * `pm2 restart sundy`: kosong = semua orang; "staff" = hanya staf yang sedang login (uji coba); "true" = tidak seorang pun.
 * Halaman publik memakai modul ini, bukan modul sesi, sehingga yang sampai ke halaman hanya satu dari tiga keadaan.
 */
export async function registrationAccess(): Promise<RegistrationAccess> {
  const mode = process.env.REGISTRATION_CLOSED;
  if (mode === "true") return "closed";
  if (mode === "staff") return (await getCurrentStaff()) ? "staff-preview" : "closed";
  return "open";
}

/** Penjaga aksi server pendaftaran: menutup halaman saja tidak cukup, aksinya bisa dipanggil langsung. */
export async function assertRegistrationOpen(): Promise<void> {
  if ((await registrationAccess()) === "closed") throw new UserFacingError("Pendaftaran online sedang ditutup.");
}

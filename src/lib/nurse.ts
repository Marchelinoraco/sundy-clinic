import { witaDateString } from "@/lib/time";

/** Pesan untuk semua aksi perawat di luar batas data (spec peran perawat 5). */
export const NURSE_OUT_OF_SCOPE = "Pasien ini tidak sedang ditangani hari ini.";

/**
 * Batas data perawat (spec peran perawat 5): booking klinik hari ini (WITA) yang sudah check-in
 * dan catatan dokternya belum final. Murni, dipakai server dan daftar.
 */
export function nurseCanWork(appointment: { status: string; channel: "KLINIK" | "ONLINE"; startAt: Date }, now: Date): boolean {
  return appointment.status === "HADIR" && appointment.channel === "KLINIK" && witaDateString(appointment.startAt) === witaDateString(now);
}

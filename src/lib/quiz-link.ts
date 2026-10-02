import type { AppointmentStatusValue } from "./appointment-status";
import type { IdentityField } from "./kuis/identity";
import type { BookingSourceValue } from "./payment";

/** Booking yang dicatat admin mendapat link kuis; customer situs sudah mengisi di /daftar (spec C3 3.1). */
export const QUIZ_LINK_SOURCES: readonly BookingSourceValue[] = ["WHATSAPP", "TELEPON", "WALK_IN"];

const LINK_STATUSES: readonly AppointmentStatusValue[] = ["MENUNGGU_KONFIRMASI", "TERKONFIRMASI"];

/** Bagian booking yang menentukan apakah linknya berlaku. */
export type QuizLinkBooking = {
  source: BookingSourceValue;
  status: AppointmentStatusValue;
  startAt: Date;
  patientId: string | null;
  intake: { status: "MENUNGGU_DIISI" | "TERISI" | "DIPERIKSA"; linkVersion: number } | null;
};

export type QuizLinkState = "OPEN" | "SUBMITTED" | "CLOSED";

/**
 * OPEN: kuis boleh diisi. SUBMITTED: sudah dikirim — link menampilkan "Terima
 * kasih". CLOSED: booking situs, tanpa pasien, tidak aktif, atau sudah dimulai.
 */
export function quizLinkState(booking: QuizLinkBooking, now: Date): QuizLinkState {
  if (!QUIZ_LINK_SOURCES.includes(booking.source) || booking.patientId === null) return "CLOSED";
  if (booking.intake && booking.intake.status !== "MENUNGGU_DIISI") return "SUBMITTED";
  if (!LINK_STATUSES.includes(booking.status) || booking.startAt.getTime() <= now.getTime()) return "CLOSED";
  return "OPEN";
}

/** Nomor versi link; 0 sampai admin menekan "Ganti link". */
export function quizLinkVersion(booking: Pick<QuizLinkBooking, "intake">): number {
  return booking.intake?.linkVersion ?? 0;
}

/** Persetujuan biaya booking hanya untuk booking berbiaya yang belum diverifikasi (spec C3 3.2). */
export function needsFeeConsent(booking: { bookingFee: number | null; status: AppointmentStatusValue }): boolean {
  return booking.bookingFee !== null && booking.status === "MENUNGGU_KONFIRMASI";
}

/** Halaman link hanya menyapa dengan nama depan (spec C3 3.2). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export type QuizKind = "LENGKAP" | "PENDEK";

/** Kuis lengkap bila pasien belum punya isian lengkap yang terkirim, termasuk pasien era kertas. */
export function quizKindFor(hasCompletedFullIntake: boolean): QuizKind {
  return hasCompletedFullIntake ? "PENDEK" : "LENGKAP";
}

/** Jalur kuis v2: kuis lengkap = customer baru, kuis pendek = customer lama. */
export function patientTypeForKind(kind: QuizKind): "BARU" | "LAMA" {
  return kind === "LENGKAP" ? "BARU" : "LAMA";
}

/** Kolom data diri pasien yang masih kosong; teks kosong dari data lama juga dihitung kosong. */
export function missingIdentityFields(patient: {
  birthDate: Date | null;
  gender: string | null;
  occupation: string | null;
  address: string | null;
}): IdentityField[] {
  const missing: IdentityField[] = [];
  if (!patient.birthDate) missing.push("birthDate");
  if (!patient.gender) missing.push("gender");
  if (!patient.occupation?.trim()) missing.push("occupation");
  if (!patient.address?.trim()) missing.push("address");
  return missing;
}

/** Baris kuis yang ditambahkan ke instruksi transfer, konfirmasi, dan pengingat (spec C3 4.1). */
export function quizLinkLines(link: string): string[] {
  return [
    `Sebelum datang, mohon isi form singkat ini (±5 menit): ${link}`,
    "Jawaban Anda hanya dibaca dokter kami.",
  ];
}

/** Isi halaman /isi untuk sebuah kode. Hanya nama depan dan jadwal — tanpa nomor WA atau data medis. */
export type QuizLinkPage =
  | {
      state: "OPEN";
      firstName: string;
      serviceName: string;
      startAt: Date;
      staffName: string;
      branchName: string;
      kind: QuizKind;
      missing: IdentityField[];
      feeConsent: { bookingFee: number } | null;
    }
  | { state: "SUBMITTED" }
  | { state: "CLOSED" };

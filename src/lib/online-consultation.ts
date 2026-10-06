import { CLINIC_NAME } from "./clinic";
import { formatIndonesianDate, formatRupiah, formatScheduleForMessage, formatShortIndonesianDate } from "./format";
import { firstName } from "./quiz-link";
import { addDaysToDateString, combineWitaDateAndMinutes, minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "./time";

/** Konsultasi online (spec 3): booking tanpa slot, berdasarkan rentang waktu luang customer. */
export const ONLINE_SERVICE_SLUG = "konsultasi-online";
/** Pengganti nama cabang di semua tampilan dan pesan booking online (spec 3.6). */
export const ONLINE_BRANCH_LABEL = "Online (WhatsApp)";
export const ONLINE_MAX_WINDOWS = 3;
export const ONLINE_FIRST_MINUTE = 8 * 60;
export const ONLINE_LAST_MINUTE = 21 * 60;
export const ONLINE_STEP_MINUTES = 30;
export const ONLINE_MIN_WINDOW_MINUTES = 60;
export const ONLINE_MAX_DAYS_AHEAD = 14;
export const ONLINE_CUSTOMER_LEAD_MINUTES = 120;

/** Rentang seperti diisi di form: tanggal WITA dan menit sejak tengah malam WITA. */
export type WindowDraft = { date: string; startMinute: number; endMinute: number };
export type ContactRange = { startAt: Date; endAt: Date };
export type WindowAudience = "CUSTOMER" | "STAFF";
export type WindowsValidation = { ok: true; windows: ContactRange[] } | { ok: false; message: string };
export type OnlinePhase = "NOW" | "TODAY" | "UPCOMING" | "NEEDS_NEW";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WINDOWS_COUNT = "Tambahkan 1 sampai 3 waktu Anda bisa dihubungi.";
const WINDOWS_INVALID = "Waktu tidak sah. Muat ulang halaman lalu coba lagi.";
const WINDOWS_DATE = "Pilih tanggal antara hari ini dan 14 hari ke depan.";
const WINDOWS_HOURS = "Jam harus antara 08.00 dan 21.00, kelipatan 30 menit.";
const WINDOWS_SHORT = "Setiap waktu minimal 1 jam.";
const WINDOWS_LEAD = "Pilih waktu paling cepat 2 jam dari sekarang.";
const WINDOWS_OVER = "Waktu yang dipilih sudah lewat.";
const WINDOWS_OVERLAP = "Waktu-waktu yang dipilih tidak boleh tumpang tindih.";

const fail = (message: string): WindowsValidation => ({ ok: false, message });

/**
 * Memeriksa 1–3 rentang waktu luang (spec 3.2). Customer paling cepat 2 jam dari
 * sekarang; resepsionis boleh rentang yang sudah mulai selama belum berakhir. Hasilnya
 * terurut menurut awal rentang.
 */
export function validateContactWindows(raw: unknown, input: { now: Date; audience: WindowAudience }): WindowsValidation {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > ONLINE_MAX_WINDOWS) return fail(WINDOWS_COUNT);

  const today = witaDateString(input.now);
  const lastDate = addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD);
  const ranges: ContactRange[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) return fail(WINDOWS_INVALID);
    const { date, startMinute, endMinute } = item as Record<string, unknown>;
    if (
      typeof date !== "string" ||
      !DATE_PATTERN.test(date) ||
      addDaysToDateString(date, 0) !== date ||
      typeof startMinute !== "number" ||
      typeof endMinute !== "number" ||
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute)
    ) {
      return fail(WINDOWS_INVALID);
    }
    if (date < today || date > lastDate) return fail(WINDOWS_DATE);
    if (
      startMinute % ONLINE_STEP_MINUTES !== 0 ||
      endMinute % ONLINE_STEP_MINUTES !== 0 ||
      startMinute < ONLINE_FIRST_MINUTE ||
      endMinute > ONLINE_LAST_MINUTE
    ) {
      return fail(WINDOWS_HOURS);
    }
    if (endMinute - startMinute < ONLINE_MIN_WINDOW_MINUTES) return fail(WINDOWS_SHORT);

    const startAt = combineWitaDateAndMinutes(date, startMinute);
    const endAt = combineWitaDateAndMinutes(date, endMinute);
    if (input.audience === "CUSTOMER") {
      if (startAt.getTime() < input.now.getTime() + ONLINE_CUSTOMER_LEAD_MINUTES * 60_000) return fail(WINDOWS_LEAD);
    } else if (endAt.getTime() <= input.now.getTime()) {
      return fail(WINDOWS_OVER);
    }
    ranges.push({ startAt, endAt });
  }

  ranges.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  for (let i = 0; i < ranges.length - 1; i++) {
    if (ranges[i].endAt.getTime() > ranges[i + 1].startAt.getTime()) return fail(WINDOWS_OVERLAP);
  }
  return { ok: true, windows: ranges };
}

export function windowDrafts(windows: readonly ContactRange[]): WindowDraft[] {
  return windows.map((w) => ({
    date: witaDateString(w.startAt),
    startMinute: witaMinutesOfDay(w.startAt),
    endMinute: witaMinutesOfDay(w.endAt),
  }));
}

/** "Rabu, 7 Oktober 2026, 19.00–21.00" */
export function windowLabel(range: ContactRange): string {
  const from = minutesToTimeLabel(witaMinutesOfDay(range.startAt));
  const to = minutesToTimeLabel(witaMinutesOfDay(range.endAt));
  return `${formatIndonesianDate(range.startAt)}, ${from}–${to}`;
}

export function windowLines(windows: readonly ContactRange[]): string[] {
  return windows.map((w) => `• ${windowLabel(w)}`);
}

/** Rentang paling awal: dipakai sebagai startAt/endAt booking sebelum konsultasi dimulai (spec 3.5). */
export function boundsOf(windows: readonly ContactRange[]): ContactRange {
  return windows.reduce((a, b) => (b.startAt.getTime() < a.startAt.getTime() ? b : a));
}

/** Rentang paling awal yang belum berakhir, atau null bila semuanya sudah lewat. */
export function nextOpenWindow(windows: readonly ContactRange[], now: Date): ContactRange | null {
  const open = windows.filter((w) => w.endAt.getTime() > now.getTime());
  return open.length > 0 ? boundsOf(open) : null;
}

/** Keadaan dasbor dokter (spec 6.1) dan "Perlu waktu baru" (spec 3.4). */
export function onlinePhase(windows: readonly ContactRange[], now: Date): OnlinePhase {
  const next = nextOpenWindow(windows, now);
  if (!next) return "NEEDS_NEW";
  if (windows.some((w) => w.startAt.getTime() <= now.getTime() && w.endAt.getTime() > now.getTime())) return "NOW";
  return witaDateString(next.startAt) === witaDateString(now) ? "TODAY" : "UPCOMING";
}

/** Jumlah yang ditransfer customer: biaya booking + harga Konsultasi Online (spec 3.3). */
export function onlineTotal(input: { bookingFee: number | null; servicePrice: number | null }): number {
  return (input.bookingFee ?? 0) + (input.servicePrice ?? 0);
}

/** "Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)" untuk percobaan terakhir. */
export function lastAttemptLabel(attempts: readonly { at: Date; staffName: string }[]): string | null {
  if (attempts.length === 0) return null;
  const last = attempts.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a));
  const time = minutesToTimeLabel(witaMinutesOfDay(last.at));
  return `Dicoba ${formatShortIndonesianDate(last.at)} ${time} — tidak terhubung (${last.staffName})`;
}

/** Link kuis untuk booking online: kalimatnya tidak menyebut "datang". */
function onlineQuizLines(link: string): string[] {
  return [`Sebelum konsultasi, mohon isi form singkat ini (±5 menit): ${link}`, "Jawaban Anda hanya dibaca dokter kami."];
}

export function onlineTransferText(input: {
  patientName: string;
  code: string;
  doctorName: string;
  windows: readonly ContactRange[];
  bookingFee: number;
  servicePrice: number;
  deadline: Date;
  /** Baris rekening siap tampil, atau kalimat pengganti bila rekening belum lengkap. */
  bankLine: string;
  quizLink?: string | null;
}): string {
  const total = onlineTotal({ bookingFee: input.bookingFee, servicePrice: input.servicePrice });
  const lines = [
    `Halo ${firstName(input.patientName)}, konsultasi online Anda di ${CLINIC_NAME} sudah kami catat.`,
    `Kode: ${input.code}`,
    `Layanan: Konsultasi Online lewat WhatsApp dengan ${input.doctorName}`,
    "Waktu Anda bisa dihubungi:",
    ...windowLines(input.windows),
    "",
    `Mohon transfer ${formatRupiah(total)} (biaya booking ${formatRupiah(input.bookingFee)} + Konsultasi Online ${formatRupiah(input.servicePrice)}) paling lambat ${formatScheduleForMessage(input.deadline)} ke:`,
    input.bankLine,
    "lalu kirim bukti transfer di chat ini.",
    "",
    "Biaya ini dibayar di muka dan tidak dikembalikan, tetapi tetap berlaku bila waktu Anda perlu diganti.",
  ];
  if (input.quizLink) lines.push("", ...onlineQuizLines(input.quizLink));
  return lines.join("\n");
}

export function onlineConfirmationText(input: {
  patientName: string;
  code: string;
  doctorName: string;
  windows: readonly ContactRange[];
  quizLink?: string | null;
}): string {
  const lines = [
    `Halo ${firstName(input.patientName)}, pembayaran konsultasi online Anda (${input.code}) sudah kami terima.`,
    `${input.doctorName} akan menelepon atau video call lewat WhatsApp ke nomor ini kapan saja di dalam salah satu waktu berikut:`,
    ...windowLines(input.windows),
    "Mohon pastikan nomor ini aktif dan bisa menerima panggilan. Bila waktu Anda berubah, balas pesan ini.",
  ];
  if (input.quizLink) lines.push("", ...onlineQuizLines(input.quizLink));
  return lines.join("\n");
}

/** Pesan "Minta waktu baru" (spec 7.3). `hadAttempt`: dokter sudah mencatat percobaan menelepon. */
export function onlineRequestNewTimeText(input: {
  patientName: string;
  code: string;
  doctorName: string;
  hadAttempt: boolean;
}): string {
  const name = firstName(input.patientName);
  const opening = input.hadAttempt
    ? `Halo ${name}, ${input.doctorName} sudah mencoba menghubungi Anda untuk konsultasi online (${input.code}), tetapi belum tersambung.`
    : `Halo ${name}, waktu yang Anda pilih untuk konsultasi online (${input.code}) sudah lewat.`;
  return [
    opening,
    'Mohon kirim 1–3 pilihan hari dan jam Anda bisa dihubungi (mis. "Senin 19.00–21.00"). Biaya yang sudah dibayar tetap berlaku.',
  ].join("\n");
}

/** Rentang yang jatuh pada tanggal WITA tertentu, terurut. */
export function reminderWindowsOn(windows: readonly ContactRange[], date: string): ContactRange[] {
  return windows.filter((w) => witaDateString(w.startAt) === date).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Pengingat H-1 (spec 7.4). Memakai tanggal lengkap: pengingat bisa terkirim lebih awal bila tanggalnya Minggu atau libur. */
export function onlineReminderText(input: {
  patientName: string;
  code: string;
  doctorName: string;
  /** Rentang pada satu tanggal yang sama. */
  windows: readonly ContactRange[];
}): string {
  const times = input.windows
    .map((w) => `${minutesToTimeLabel(witaMinutesOfDay(w.startAt))}–${minutesToTimeLabel(witaMinutesOfDay(w.endAt))}`)
    .join(" atau ");
  return `Halo ${firstName(input.patientName)}, mengingatkan: pada ${formatIndonesianDate(input.windows[0].startAt)}, ${input.doctorName} akan menghubungi Anda lewat WhatsApp antara ${times} untuk konsultasi online (${input.code}). Mohon pastikan nomor ini aktif.`;
}

/** Nama tempat di daftar dan riwayat: booking online memakai "Online (WhatsApp)" (spec 3.6). */
export function placeLabel(channel: "KLINIK" | "ONLINE", branchName: string): string {
  return channel === "ONLINE" ? ONLINE_BRANCH_LABEL : branchName;
}

/** Rentang baru di form: tanggal dipilih customer, jam awal 19.00–21.00. */
export const EMPTY_WINDOW_DRAFT: WindowDraft = { date: "", startMinute: 19 * 60, endMinute: 21 * 60 };

/** Aturan biaya versi online di /daftar (spec 4.3). */
export const ONLINE_FEE_TERMS =
  "Total biaya (biaya booking + Konsultasi Online) dibayar di muka dan tidak dikembalikan, tetapi tetap berlaku bila waktu Anda perlu diganti.";

/** Pesan galat form waktu luang: tanggal kosong lebih dulu, lalu aturan rentang. */
export function windowDraftsError(windows: readonly WindowDraft[], audience: WindowAudience, now: Date): string | null {
  if (windows.some((w) => !w.date)) return "Pilih tanggal untuk setiap waktu.";
  const checked = validateContactWindows(windows, { now, audience });
  return checked.ok ? null : checked.message;
}

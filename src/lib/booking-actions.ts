import type { AppointmentStatusValue } from "./appointment-status";
import type { WindowDraft } from "./online-consultation";
import type { BookingSourceValue } from "./payment";

export type BookingAction =
  | "VERIFY"
  | "SEND_TRANSFER"
  | "COPY_TRANSFER"
  | "MATCH"
  | "CHANGE_PATIENT"
  | "VIEW_INTAKE"
  | "ATTEND"
  | "SEND_CONFIRMATION"
  | "COPY_CONFIRMATION"
  | "NO_SHOW"
  | "RESCHEDULE"
  | "QUIZ_LINK"
  | "FOOD_RECALL"
  | "UPLOAD_BIA"
  | "CHANGE_WINDOWS"
  | "REQUEST_NEW_TIME"
  | "CANCEL";

export const BOOKING_ACTION_LABEL: Record<BookingAction, string> = {
  VERIFY: "Verifikasi",
  SEND_TRANSFER: "Kirim instruksi transfer",
  COPY_TRANSFER: "Salin instruksi transfer",
  MATCH: "Cocokkan pasien",
  CHANGE_PATIENT: "Ganti pasien",
  VIEW_INTAKE: "Lihat isian",
  ATTEND: "Check-in",
  SEND_CONFIRMATION: "Kirim konfirmasi",
  COPY_CONFIRMATION: "Salin konfirmasi",
  NO_SHOW: "Tidak hadir",
  RESCHEDULE: "Pindah jadwal",
  QUIZ_LINK: "Link kuis",
  FOOD_RECALL: "Food recall",
  UPLOAD_BIA: "Unggah hasil BIA",
  CHANGE_WINDOWS: "Ubah waktu luang",
  REQUEST_NEW_TIME: "Minta waktu baru via WA",
  CANCEL: "Batalkan",
};

export type BookingActionRow = {
  status: AppointmentStatusValue;
  source: BookingSourceValue;
  needsMatch: boolean;
  isSiteBooking: boolean;
  intakeId: string | null;
  transferInstruction: { link: string | null } | null;
  confirmation: { link: string | null } | null;
  /** Link kuis yang berlaku (spec C3); null/absen bila kuis sudah diisi, booking situs, atau tidak aktif. */
  quizLink?: string | null;
  /** Customer sudah check-in hari ini dan catatan dokternya belum final (spec check-in 4.4). */
  foodRecallAvailable?: boolean;
  /** Staf boleh mengunggah hasil BIA untuk booking klinik yang sudah check-in (spec hasil BIA 6.1). */
  biaUploadAvailable?: boolean;
  /** Kanal booking; kosong dianggap klinik. */
  channel?: "KLINIK" | "ONLINE";
  /** Booking online yang semua rentangnya lewat: tautan WA "Minta waktu baru" (spec konsultasi online 5.3). */
  requestNewTime?: { link: string | null } | null;
};

/** Data yang dibutuhkan dialog Pindah jadwal (spec C2 bagian 5). Tenaga, cabang, dan durasi tetap. */
export type RescheduleTarget = {
  appointmentId: string;
  code: string;
  patientName: string;
  startAt: Date;
  durationMinutes: number;
  staffId: string;
  staffName: string;
  branchId: string;
  branchName: string;
};

/** Data dialog Ubah waktu luang booking online. */
export type ContactWindowsTarget = { appointmentId: string; code: string; patientName: string; windows: WindowDraft[] };

/** Booking online yang belum dimulai menampilkan rentang waktu luang menggantikan jam. */
export function showsContactWindows(row: { status: AppointmentStatusValue; online: unknown | null }): boolean {
  return row.online !== null && (row.status === "MENUNGGU_KONFIRMASI" || row.status === "TERKONFIRMASI");
}

const CLINIC_ONLY: ReadonlySet<BookingAction> = new Set(["ATTEND", "NO_SHOW", "RESCHEDULE"]);

/** Booking online: tanpa Check-in, Tidak hadir, dan Pindah jadwal; ada Ubah waktu luang (spec 5.3). */
function onlineRowActions(
  row: BookingActionRow,
  actions: { primary: BookingAction[]; menu: BookingAction[] },
): { primary: BookingAction[]; menu: BookingAction[] } {
  let primary = actions.primary.filter((a) => !CLINIC_ONLY.has(a));
  let menu = actions.menu.filter((a) => !CLINIC_ONLY.has(a));
  if (row.status !== "MENUNGGU_KONFIRMASI" && row.status !== "TERKONFIRMASI") return { primary, menu };

  const cancelAt = menu.indexOf("CANCEL");
  menu = cancelAt === -1 ? [...menu, "CHANGE_WINDOWS"] : [...menu.slice(0, cancelAt), "CHANGE_WINDOWS", ...menu.slice(cancelAt)];
  if (row.requestNewTime) {
    menu = [...primary, ...menu.filter((a) => a !== "CHANGE_WINDOWS")];
    primary = ["REQUEST_NEW_TIME", "CHANGE_WINDOWS"];
  }
  return { primary, menu };
}

function baseRowActions(
  row: BookingActionRow,
  canReadRecords: boolean,
): { primary: BookingAction[]; menu: BookingAction[] } {
  const intake: BookingAction[] = row.intakeId && canReadRecords ? ["VIEW_INTAKE"] : [];

  if (row.status === "MENUNGGU_KONFIRMASI") {
    if (row.needsMatch) return { primary: ["MATCH"], menu: [...intake, "CANCEL"] };
    if (row.isSiteBooking) {
      return {
        primary: ["VERIFY"],
        menu: [...intake, "CHANGE_PATIENT", "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
      };
    }
    // Walk-in: pasiennya sudah di klinik, tidak ada transfer yang ditunggu.
    if (row.source === "WALK_IN") {
      return { primary: ["ATTEND", "VERIFY"], menu: [...intake, "NO_SHOW", "RESCHEDULE", "CANCEL"] };
    }
    if (row.transferInstruction) {
      return {
        primary: row.transferInstruction.link ? ["VERIFY", "SEND_TRANSFER"] : ["VERIFY"],
        menu: ["COPY_TRANSFER", ...intake, "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"],
      };
    }
    return { primary: ["VERIFY"], menu: [...intake, "ATTEND", "NO_SHOW", "RESCHEDULE", "CANCEL"] };
  }

  if (row.status === "TERKONFIRMASI") {
    const primary: BookingAction[] = ["ATTEND"];
    if (row.confirmation?.link) primary.push("SEND_CONFIRMATION");
    const menu: BookingAction[] = [];
    if (row.confirmation) menu.push("COPY_CONFIRMATION");
    menu.push(...intake, "NO_SHOW", "RESCHEDULE", "CANCEL");
    return { primary, menu };
  }

  const menu: BookingAction[] = [];
  if (row.foodRecallAvailable) menu.push("FOOD_RECALL");
  if (row.biaUploadAvailable) menu.push("UPLOAD_BIA");
  return { primary: [], menu: [...menu, ...intake] };
}

/**
 * Aksi per baris daftar booking (spec C1 5.2): paling banyak dua terlihat,
 * sisanya di menu ⋯. Hadir dan Tidak hadir tetap ada di menu untuk booking
 * yang belum diverifikasi, seperti sebelumnya: pasien kadang datang sebelum
 * bukti transfernya diperiksa. Pindah jadwal (spec C2 bagian 5) selalu tepat
 * sebelum Batalkan. "Link kuis" (spec C3 4.2) menjadi item pertama selama linknya berlaku.
 */
export function bookingRowActions(
  row: BookingActionRow,
  canReadRecords: boolean,
): { primary: BookingAction[]; menu: BookingAction[] } {
  const base = baseRowActions(row, canReadRecords);
  const actions = row.channel === "ONLINE" ? onlineRowActions(row, base) : base;
  return row.quizLink ? { ...actions, menu: ["QUIZ_LINK", ...actions.menu] } : actions;
  return row.quizLink ? { ...actions, menu: ["QUIZ_LINK", ...actions.menu] } : actions;
}

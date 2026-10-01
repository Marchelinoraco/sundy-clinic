import type { AppointmentStatusValue } from "./appointment-status";
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
  | "CANCEL";

export const BOOKING_ACTION_LABEL: Record<BookingAction, string> = {
  VERIFY: "Verifikasi",
  SEND_TRANSFER: "Kirim instruksi transfer",
  COPY_TRANSFER: "Salin instruksi transfer",
  MATCH: "Cocokkan pasien",
  CHANGE_PATIENT: "Ganti pasien",
  VIEW_INTAKE: "Lihat isian",
  ATTEND: "Hadir",
  SEND_CONFIRMATION: "Kirim konfirmasi",
  COPY_CONFIRMATION: "Salin konfirmasi",
  NO_SHOW: "Tidak hadir",
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
};

/**
 * Aksi per baris daftar booking (spec C1 5.2): paling banyak dua terlihat,
 * sisanya di menu ⋯. Hadir dan Tidak hadir tetap ada di menu untuk booking
 * yang belum diverifikasi, seperti sebelumnya: pasien kadang datang sebelum
 * bukti transfernya diperiksa.
 */
export function bookingRowActions(
  row: BookingActionRow,
  canReadRecords: boolean,
): { primary: BookingAction[]; menu: BookingAction[] } {
  const intake: BookingAction[] = row.intakeId && canReadRecords ? ["VIEW_INTAKE"] : [];

  if (row.status === "MENUNGGU_KONFIRMASI") {
    if (row.needsMatch) return { primary: ["MATCH"], menu: [...intake, "CANCEL"] };
    if (row.isSiteBooking) {
      return { primary: ["VERIFY"], menu: [...intake, "CHANGE_PATIENT", "ATTEND", "NO_SHOW", "CANCEL"] };
    }
    // Walk-in: pasiennya sudah di klinik, tidak ada transfer yang ditunggu.
    if (row.source === "WALK_IN") return { primary: ["ATTEND", "VERIFY"], menu: [...intake, "NO_SHOW", "CANCEL"] };
    if (row.transferInstruction) {
      return {
        primary: row.transferInstruction.link ? ["VERIFY", "SEND_TRANSFER"] : ["VERIFY"],
        menu: ["COPY_TRANSFER", ...intake, "ATTEND", "NO_SHOW", "CANCEL"],
      };
    }
    return { primary: ["VERIFY"], menu: [...intake, "ATTEND", "NO_SHOW", "CANCEL"] };
  }

  if (row.status === "TERKONFIRMASI") {
    const primary: BookingAction[] = ["ATTEND"];
    if (row.confirmation?.link) primary.push("SEND_CONFIRMATION");
    const menu: BookingAction[] = [];
    if (row.confirmation) menu.push("COPY_CONFIRMATION");
    menu.push(...intake, "NO_SHOW", "CANCEL");
    return { primary, menu };
  }

  return { primary: [], menu: intake };
}

import { combineWitaDateAndMinutes, minutesToTimeLabel } from "./time";

export type WorkWindow = { startMinute: number; endMinute: number };
export type ExceptionKind = "LIBUR" | "JAM_TAMBAHAN" | "BLOKIR_SEBAGIAN";
export type ScheduleExceptionInput = {
  kind: ExceptionKind;
  startMinute: number | null;
  endMinute: number | null;
};
export type BusyRange = { startAt: Date; endAt: Date };
export type SlotOption = { startAt: Date; endAt: Date; label: string };

type GetAvailableSlotsInput = {
  /** Tanggal WITA "YYYY-MM-DD" yang diminta. */
  date: string;
  /** Durasi layanan yang dipesan, dalam menit. */
  durationMinutes: number;
  /** Jam kerja staf ini di cabang ini pada hari-dalam-minggu tanggal tsb, atau null bila tidak bekerja. */
  template: WorkWindow | null;
  /** Pengecualian staf ini pada tanggal ini saja. */
  exceptions: ScheduleExceptionInput[];
  /** Apakah tanggal ini hari libur klinik (berlaku semua cabang). */
  isHoliday: boolean;
  /** Rentang waktu yang sudah terisi (booking + hold aktif) milik staf ini. */
  busy: BusyRange[];
  /** Waktu sekarang, untuk aturan lead time minimum. */
  now: Date;
  /** Booking paling cepat berapa menit dari sekarang (PRD: 120). */
  minLeadMinutes: number;
};

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Mengurangi rentang blokir dari satu jendela kerja, menghasilkan 0+ sub-jendela. */
function subtractBlocks(window: WorkWindow, blocks: WorkWindow[]): WorkWindow[] {
  let pieces = [window];
  for (const block of blocks) {
    const next: WorkWindow[] = [];
    for (const piece of pieces) {
      if (!rangesOverlap(piece.startMinute, piece.endMinute, block.startMinute, block.endMinute)) {
        next.push(piece);
        continue;
      }
      if (piece.startMinute < block.startMinute) {
        next.push({ startMinute: piece.startMinute, endMinute: block.startMinute });
      }
      if (block.endMinute < piece.endMinute) {
        next.push({ startMinute: block.endMinute, endMinute: piece.endMinute });
      }
    }
    pieces = next;
  }
  return pieces;
}

/**
 * Menghitung slot kosong untuk satu staf pada satu tanggal.
 *
 * Fungsi murni — tidak menyentuh basis data. Jaminan anti-bentrok yang
 * sesungguhnya ada di exclusion constraint PostgreSQL (lihat migrasi
 * Appointment); fungsi ini hanya menjaga pengalaman pasien/admin tetap wajar
 * dengan tidak menawarkan slot yang jelas-jelas sudah terisi.
 */
export function getAvailableSlots(input: GetAvailableSlotsInput): SlotOption[] {
  if (input.isHoliday) return [];
  if (input.exceptions.some((e) => e.kind === "LIBUR")) return [];

  const windows: WorkWindow[] = [];
  if (input.template) windows.push(input.template);
  for (const e of input.exceptions) {
    if (e.kind === "JAM_TAMBAHAN" && e.startMinute !== null && e.endMinute !== null) {
      windows.push({ startMinute: e.startMinute, endMinute: e.endMinute });
    }
  }
  if (windows.length === 0) return [];

  const blocks: WorkWindow[] = input.exceptions
    .filter((e) => e.kind === "BLOKIR_SEBAGIAN" && e.startMinute !== null && e.endMinute !== null)
    .map((e) => ({ startMinute: e.startMinute!, endMinute: e.endMinute! }));

  const freeWindows = windows.flatMap((w) => subtractBlocks(w, blocks));

  const earliestStartMs = input.now.getTime() + input.minLeadMinutes * 60_000;
  const seenStartMinutes = new Set<number>();
  const result: SlotOption[] = [];

  const GRID_MINUTES = 30;

  for (const window of freeWindows) {
    for (
      let candidate = window.startMinute;
      candidate + input.durationMinutes <= window.endMinute;
      candidate += GRID_MINUTES
    ) {
      if (seenStartMinutes.has(candidate)) continue;

      const startAt = combineWitaDateAndMinutes(input.date, candidate);
      const endAt = combineWitaDateAndMinutes(input.date, candidate + input.durationMinutes);

      if (startAt.getTime() < earliestStartMs) continue;

      const overlapsBusy = input.busy.some((b) => startAt < b.endAt && b.startAt < endAt);
      if (overlapsBusy) continue;

      seenStartMinutes.add(candidate);
      result.push({ startAt, endAt, label: minutesToTimeLabel(candidate) });
    }
  }

  result.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return result;
}

import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

// Isian tanggal panel admin (spec MUI 4): nilai di aplikasi tetap teks tanggal kalender ("YYYY-MM-DD",
// bulan "YYYY-MM"); dayjs hanya dipakai pemilih. Tanpa zona waktu, jadi tidak bisa bergeser sehari.

export const DATE_FIELD_FORMAT = "DD/MM/YYYY";
export const MONTH_FIELD_FORMAT = "MM/YYYY";

function parseStrict(text: string, format: string): Dayjs | null {
  if (!text) return null;
  const value = dayjs(text, format, true);
  return value.isValid() ? value : null;
}

/** Ketikan belum selesai (tahun < 1000) dihitung kosong supaya validasi "wajib diisi" yang berlaku. */
function formatComplete(value: Dayjs | null, format: string): string {
  if (!value || !value.isValid() || value.year() < 1000) return "";
  return value.format(format);
}

export function dateTextToDayjs(text: string): Dayjs | null {
  return parseStrict(text, "YYYY-MM-DD");
}

export function dayjsToDateText(value: Dayjs | null): string {
  return formatComplete(value, "YYYY-MM-DD");
}

export function monthTextToDayjs(text: string): Dayjs | null {
  return parseStrict(text, "YYYY-MM");
}

export function dayjsToMonthText(value: Dayjs | null): string {
  return formatComplete(value, "YYYY-MM");
}

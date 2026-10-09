import type { StaffRole } from "@prisma/client";
import { formatDecimal } from "./encounter";
import { can } from "./permissions";

/** Aturan murni hasil Timbang BIA (spec hasil BIA 3–5): angka, jenis berkas, nama berkas, dan hak. Tanpa basis data. */

export type BiaKey =
  | "bodyFatPercent"
  | "muscleMassKg"
  | "visceralFat"
  | "bmr"
  | "metabolicAge"
  | "bodyWaterPercent"
  | "boneMassKg";
export type BiaNumbers = Record<BiaKey, number | null>;
export type BiaInput = Record<BiaKey, string>;
type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export type BiaFieldSpec = { key: BiaKey; label: string; unit: string; min: number; max: number; decimals: 0 | 1 };

export const BIA_FIELDS: readonly BiaFieldSpec[] = [
  { key: "bodyFatPercent", label: "Lemak tubuh", unit: "%", min: 2, max: 70, decimals: 1 },
  { key: "muscleMassKg", label: "Massa otot", unit: "kg", min: 5, max: 120, decimals: 1 },
  { key: "visceralFat", label: "Lemak viseral", unit: "", min: 1, max: 59, decimals: 0 },
  { key: "bmr", label: "Metabolisme basal", unit: "kkal", min: 500, max: 5000, decimals: 0 },
  { key: "metabolicAge", label: "Usia metabolik", unit: "tahun", min: 5, max: 110, decimals: 0 },
  { key: "bodyWaterPercent", label: "Air tubuh", unit: "%", min: 20, max: 80, decimals: 1 },
  { key: "boneMassKg", label: "Massa tulang", unit: "kg", min: 0.5, max: 10, decimals: 1 },
];
export const BIA_KEYS: BiaKey[] = BIA_FIELDS.map((field) => field.key);

export const EMPTY_BIA_NUMBERS: BiaNumbers = {
  bodyFatPercent: null,
  muscleMassKg: null,
  visceralFat: null,
  bmr: null,
  metabolicAge: null,
  bodyWaterPercent: null,
  boneMassKg: null,
};
export const EMPTY_BIA_INPUT: BiaInput = {
  bodyFatPercent: "",
  muscleMassKg: "",
  visceralFat: "",
  bmr: "",
  metabolicAge: "",
  bodyWaterPercent: "",
  boneMassKg: "",
};

export const BIA_NOTE_MAX = 500;
export const BIA_MAX_FILES = 5;
export const BIA_MAX_BYTES = 10 * 1024 * 1024;
/** Untuk atribut `accept` kotak pilih berkas (HEIF/HEIC dari iPhone ikut). */
export const BIA_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

function rangeText(spec: BiaFieldSpec): string {
  const unit = spec.unit ? ` ${spec.unit}` : "";
  return `${formatDecimal(spec.min)}–${formatDecimal(spec.max)}${unit}`;
}

/** Label isian: nama dan satuan, mis. "Lemak tubuh (%)". */
export function biaFieldLabel(spec: BiaFieldSpec): string {
  return spec.unit ? `${spec.label} (${spec.unit})` : spec.label;
}

/** Satu angka dari teks isian. Koma dan titik sama-sama tanda desimal. */
export function parseBiaNumber(spec: BiaFieldSpec, raw: string): Parsed<number | null> {
  const value = raw.trim().replace(",", ".");
  if (value === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(value)) return fail(`${spec.label} harus berupa angka.`);
  const fraction = value.split(".")[1] ?? "";
  if (spec.decimals === 0 && fraction.length > 0) return fail(`${spec.label} harus bilangan bulat.`);
  if (fraction.length > 1) return fail(`${spec.label} paling banyak satu angka di belakang koma.`);
  const number = Number(value);
  if (number < spec.min || number > spec.max) return fail(`${spec.label} harus ${rangeText(spec)}.`);
  return { ok: true, value: number };
}

/** Seluruh isian: pesan pertama yang ditemukan dikembalikan apa adanya ke pengguna. */
export function parseBiaInput(input: BiaInput, note: string): Parsed<{ numbers: BiaNumbers; note: string | null }> {
  const numbers: BiaNumbers = { ...EMPTY_BIA_NUMBERS };
  for (const spec of BIA_FIELDS) {
    const parsed = parseBiaNumber(spec, input[spec.key] ?? "");
    if (!parsed.ok) return parsed;
    numbers[spec.key] = parsed.value;
  }
  if (BIA_KEYS.every((key) => numbers[key] === null)) return fail("Isi minimal satu angka BIA.");
  const cleanNote = String(note ?? "").trim();
  if (cleanNote.length > BIA_NOTE_MAX) return fail(`Catatan paling banyak ${BIA_NOTE_MAX} karakter.`);
  return { ok: true, value: { numbers, note: cleanNote || null } };
}

export function biaInputValue(key: BiaKey, value: number | null): string {
  const spec = BIA_FIELDS.find((field) => field.key === key)!;
  return value === null ? "" : formatDecimal(value, spec.decimals);
}

export type BiaFileType = {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf";
  ext: "jpg" | "png" | "webp" | "heic" | "pdf";
  /** Bisa ditampilkan peramban; HEIC hanya bisa diunduh. */
  previewable: boolean;
};

const HEIC_BRANDS = ["heic", "heix", "hevc", "mif1", "msf1"];

/** Jenis berkas dari byte awalnya, bukan dari nama atau mime kiriman klien. */
export function detectBiaFileType(bytes: Uint8Array): BiaFileType | null {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg", previewable: true };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && text(1, 4) === "PNG") return { mime: "image/png", ext: "png", previewable: true };
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp", previewable: true };
  if (bytes.length >= 12 && text(4, 8) === "ftyp" && HEIC_BRANDS.includes(text(8, 12))) {
    return { mime: "image/heic", ext: "heic", previewable: false };
  }
  if (bytes.length >= 5 && text(0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf", previewable: true };
  return null;
}

/** Nama asli untuk tampilan: tanpa jalur, karakter kendali, dan tanda kutip; paling panjang 120 karakter (ekstensi dijaga). */
export function safeOriginalName(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "berkas";
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 8 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - ext.length) + ext;
}

/** Header Content-Disposition: nama ASCII untuk peramban lama, versi UTF-8 (RFC 5987) untuk yang lain. */
export function contentDisposition(name: string, disposition: "inline" | "attachment"): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export type BiaAccess = { upload: boolean; editNumbers: boolean; voidAny: boolean; voidOwnFile: boolean; view: boolean };

/**
 * Hak atas BIA satu booking (spec hasil BIA 3.3 dan 5). `editNumbers` hanya berarti peran dan status mengizinkan;
 * angka yang sudah pernah tersimpan masih dikunci setelah SELESAI oleh aksi server dan pemicu basis data.
 */
export function biaAccess(role: StaffRole, appointment: { status: string; channel: "KLINIK" | "ONLINE" }): BiaAccess {
  const view = can(role, "record:read");
  const none: BiaAccess = { upload: false, editNumbers: false, voidAny: false, voidOwnFile: false, view };
  if (appointment.channel !== "KLINIK") return none;
  const clinical = can(role, "record:write");
  const uploader = can(role, "bia:upload");
  if (appointment.status === "HADIR") {
    return { upload: uploader, editNumbers: clinical, voidAny: clinical, voidOwnFile: uploader, view };
  }
  if (appointment.status === "SELESAI") {
    return { upload: uploader && clinical, editNumbers: clinical, voidAny: clinical, voidOwnFile: false, view };
  }
  return none;
}

/** Satu titik grafik komposisi tubuh. */
export type BiaPoint = { at: Date; bodyFatPercent: number | null; muscleMassKg: number | null };

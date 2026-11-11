import { isDateString, type Validation } from "./stock";
import { addDaysToDateString } from "./time";
import { PACKAGE_REASON_MAX } from "./treatment-package";

// Aturan murni paket lama dari Kluto (spec docs/superpowers/specs/2026-11-11-paket-lama-kluto-design.md PL5, PL11, PL13).
// Dipakai server dan dialog; tanpa akses basis data.

export const LEGACY_NOTE_MAX = 200;
export const LEGACY_BOUGHT_MIN = "2000-01-01";
export const LEGACY_PRIOR_VISITS_MAX = 1000;

/** Satu isi paket katalog untuk dialog paket lama; `id` = TreatmentPackageItem.id. */
export type LegacyCatalogItem = { id: string; name: string; unit: string | null; sessions: number; perVisit: number | null };
export type LegacyCatalogPackage = { id: string; name: string; isActive: boolean; visitIntervalDays: number; items: LegacyCatalogItem[] };

/** Isian dialog apa adanya; `used` = id isi katalog → sudah dipakai/diambil di Kluto. */
export type LegacyPackageForm = {
  packageId: string;
  boughtOn: string;
  priorVisits: number;
  used: Record<string, number>;
  nextVisitOn: string | null;
  note: string;
  confirmDuplicate: boolean;
};

export type ValidLegacyPackage = {
  boughtOn: string;
  priorVisits: number;
  /** Urutan sama dengan isi katalog. */
  used: { itemId: string; used: number }[];
  nextVisitOn: string | null;
  note: string | null;
};

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const sameKeys = (record: Record<string, unknown>, ids: readonly string[]) => {
  const keys = Object.keys(record);
  return keys.length === ids.length && ids.every((id) => Object.hasOwn(record, id));
};

/**
 * Yang sudah dipakai per isi dari jumlah kunjungan di Kluto, dengan aturan rencana kunjungan (planVisits): treatment 1 sesi
 * per kunjungan, barang sebanyak jumlah per kunjungan (1 bila kosong), tidak melebihi jatah.
 */
export function usedFromVisits(items: readonly Pick<LegacyCatalogItem, "sessions" | "perVisit">[], visits: number): number[] {
  const count = Number.isFinite(visits) ? Math.max(0, Math.floor(visits)) : 0;
  return items.map((item) => Math.min(item.sessions, count * (item.perVisit ?? 1)));
}

/** Kunjungan berikutnya bawaan di dialog: hari ini + jarak kunjungan katalog (PL13). */
export function defaultNextVisit(today: string, intervalDays: number): string {
  return addDaysToDateString(today, intervalDays);
}

export function validateLegacyPackage(
  raw: unknown,
  ctx: { today: string; items: readonly Pick<LegacyCatalogItem, "id" | "name" | "sessions">[] },
): Validation<ValidLegacyPackage> {
  if (!isRecord(raw)) return fail(INVALID_FORM);
  if (typeof raw.packageId !== "string" || !raw.packageId) return fail("Pilih paket.");

  if (raw.boughtOn === undefined || raw.boughtOn === null || raw.boughtOn === "") return fail("Isi tanggal beli di Kluto.");
  if (!isDateString(raw.boughtOn) || raw.boughtOn < LEGACY_BOUGHT_MIN) return fail("Tanggal beli tidak sah.");
  if (raw.boughtOn > ctx.today) return fail("Tanggal beli tidak boleh di masa depan.");

  if (!isWhole(raw.priorVisits, 0, LEGACY_PRIOR_VISITS_MAX)) return fail(`Jumlah kunjungan di Kluto 0–${LEGACY_PRIOR_VISITS_MAX}.`);

  if (!isRecord(raw.used) || !sameKeys(raw.used, ctx.items.map((item) => item.id))) return fail(INVALID_FORM);
  const usedMap = raw.used;
  const used: ValidLegacyPackage["used"] = [];
  for (const item of ctx.items) {
    const value = usedMap[item.id];
    if (!isWhole(value, 0, item.sessions)) return fail(`Sudah dipakai ${item.name} 0–${item.sessions}.`);
    used.push({ itemId: item.id, used: value });
  }
  if (ctx.items.every((item, index) => used[index].used >= item.sessions)) {
    return fail("Semua sesi paket ini sudah terpakai di Kluto, jadi tidak perlu dimasukkan.");
  }

  let nextVisitOn: string | null = null;
  if (raw.nextVisitOn !== null && raw.nextVisitOn !== undefined && raw.nextVisitOn !== "") {
    if (!isDateString(raw.nextVisitOn)) return fail(INVALID_FORM);
    if (raw.nextVisitOn < ctx.today) return fail("Kunjungan berikutnya tidak boleh sebelum hari ini.");
    nextVisitOn = raw.nextVisitOn;
  }

  if (raw.note !== undefined && raw.note !== null && typeof raw.note !== "string") return fail(INVALID_FORM);
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > LEGACY_NOTE_MAX) return fail(`Catatan paling banyak ${LEGACY_NOTE_MAX} karakter.`);

  return { ok: true, value: { boughtOn: raw.boughtOn, priorVisits: raw.priorVisits, used, nextVisitOn, note: note || null } };
}

/** Alasan pembatalan atau koreksi: wajib, dirapikan, paling banyak 200 karakter. */
export function validateReason(raw: unknown, emptyMessage: string): Validation<string> {
  if (raw !== undefined && raw !== null && typeof raw !== "string") return fail(INVALID_FORM);
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (!reason) return fail(emptyMessage);
  if (reason.length > PACKAGE_REASON_MAX) return fail(`Alasan paling banyak ${PACKAGE_REASON_MAX} karakter.`);
  return { ok: true, value: reason };
}

/**
 * Koreksi sisa paket lama (PL11, spec bagian 6): sisa baru per isi 0..batas (jatah − terpakai di SunDY), minimal satu
 * berubah, alasan wajib. Hasilnya hanya isi yang berubah.
 */
export function validateRemainingCorrection(
  raw: unknown,
  ctx: { items: readonly { id: string; name: string; remaining: number; max: number }[] },
): Validation<{ reason: string; changes: { itemId: string; name: string; from: number; to: number }[] }> {
  if (!isRecord(raw) || !isRecord(raw.remaining) || !sameKeys(raw.remaining, ctx.items.map((item) => item.id))) return fail(INVALID_FORM);
  const wanted = raw.remaining;
  const changes: { itemId: string; name: string; from: number; to: number }[] = [];
  for (const item of ctx.items) {
    const value = wanted[item.id];
    if (!isWhole(value, 0, item.max)) return fail(`Sisa ${item.name} 0–${item.max}.`);
    if (value !== item.remaining) changes.push({ itemId: item.id, name: item.name, from: item.remaining, to: value });
  }
  if (changes.length === 0) return fail("Tidak ada sisa yang berubah.");
  const reason = validateReason(raw.reason, "Isi alasan koreksi.");
  if (!reason.ok) return reason;
  return { ok: true, value: { reason: reason.value, changes } };
}

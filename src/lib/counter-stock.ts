import { dateOnlyString, type Validation } from "./stock";

/** Aturan stok meja resepsionis dan permintaan restock (spec stok meja 3–4). Murni: dipakai server dan browser. */

export type StockLocationValue = "GUDANG" | "MEJA";
export const STOCK_LOCATION_LABEL: Record<StockLocationValue, string> = { GUDANG: "Gudang", MEJA: "Meja" };

export type RestockStatusValue = "MENUNGGU" | "SELESAI" | "DITOLAK" | "DIBATALKAN";
export const RESTOCK_STATUS_LABEL: Record<RestockStatusValue, string> = {
  MENUNGGU: "Menunggu",
  SELESAI: "Selesai",
  DITOLAK: "Ditolak",
  DIBATALKAN: "Dibatalkan",
};

export type CounterFlag = "MEJA_MENIPIS" | "MEJA_HABIS";

export const RESTOCK_LINES_MAX = 30;
export const RESTOCK_QUANTITY_MAX = 9999;
export const RESTOCK_NOTE_MAX = 300;
const SEND_MAX = 999_999;
const INVALID = "Data tidak sah. Muat ulang halaman lalu coba lagi.";

const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const isExpired = (batch: { expiryDate: Date | null }, today: string) => batch.expiryDate !== null && dateOnlyString(batch.expiryDate) < today;

/** Sisa yang boleh dipakai (tanpa batch kedaluwarsa) di gudang, meja, atau keduanya. `today` tanggal WITA. */
export function availableStock(
  batches: readonly { quantityRemaining: number; counterRemaining: number; expiryDate: Date | null }[],
  today: string,
  where: StockLocationValue | "SEMUA",
): number {
  let total = 0;
  for (const batch of batches) {
    if (isExpired(batch, today)) continue;
    if (where !== "MEJA") total += Math.max(batch.quantityRemaining, 0);
    if (where !== "GUDANG") total += Math.max(batch.counterRemaining, 0);
  }
  return total;
}

/** Keadaan meja satu barang di satu cabang (spec stok meja 3): tanda hanya bila Batas meja > 0. */
export function counterState(
  batches: readonly { counterRemaining: number; expiryDate: Date | null }[],
  counterMinStock: number,
  today: string,
): { available: number; expired: number; flag: CounterFlag | null } {
  let available = 0;
  let expired = 0;
  for (const batch of batches) {
    if (batch.counterRemaining <= 0) continue;
    if (isExpired(batch, today)) expired += batch.counterRemaining;
    else available += batch.counterRemaining;
  }
  const flag: CounterFlag | null =
    counterMinStock <= 0 ? null : available === 0 ? "MEJA_HABIS" : available <= counterMinStock ? "MEJA_MENIPIS" : null;
  return { available, expired, flag };
}

/** Jumlah usulan di dialog Minta restock (spec stok meja 4.1): sampai dua kali Batas meja. */
export function suggestedRestock(counterMinStock: number, available: number): number {
  return Math.min(Math.max(2 * counterMinStock - available, 1), RESTOCK_QUANTITY_MAX);
}

export type RestockRequestInput = { branchId: string; note: string; lines: { itemId: string; quantity: number }[] };
export type ValidRestockRequest = { branchId: string; note: string | null; lines: { itemId: string; quantity: number }[] };

export function validateRestockRequest(raw: unknown): Validation<ValidRestockRequest> {
  if (!isObject(raw)) return fail(INVALID);
  if (typeof raw.branchId !== "string" || !raw.branchId) return fail("Pilih cabang.");
  if (!Array.isArray(raw.lines)) return fail(INVALID);
  if (raw.lines.length === 0) return fail("Pilih minimal satu barang.");
  if (raw.lines.length > RESTOCK_LINES_MAX) return fail(`Paling banyak ${RESTOCK_LINES_MAX} barang per permintaan.`);
  const seen = new Set<string>();
  const lines: { itemId: string; quantity: number }[] = [];
  for (const line of raw.lines as unknown[]) {
    if (!isObject(line) || typeof line.itemId !== "string" || !line.itemId) return fail("Pilih barang dari daftar.");
    if (seen.has(line.itemId)) return fail("Barang yang sama dipilih dua kali.");
    if (!isWhole(line.quantity, 1, RESTOCK_QUANTITY_MAX)) return fail("Jumlah restock harus bilangan bulat 1–9.999.");
    seen.add(line.itemId);
    lines.push({ itemId: line.itemId, quantity: line.quantity });
  }
  const note = raw.note === undefined || raw.note === null ? "" : typeof raw.note === "string" ? raw.note.trim() : null;
  if (note === null) return fail(INVALID);
  if (note.length > RESTOCK_NOTE_MAX) return fail(`Catatan paling banyak ${RESTOCK_NOTE_MAX} karakter.`);
  return { ok: true, value: { branchId: raw.branchId, note: note || null, lines } };
}

/** Jumlah kirim Apoteker per baris (spec stok meja 4.2): semua baris diisi, minimal satu lebih dari 0. */
export function validateRestockSend(raw: unknown, ctx: { lineIds: readonly string[] }): Validation<{ lineId: string; quantity: number }[]> {
  if (!Array.isArray(raw)) return fail(INVALID);
  const byLine = new Map<string, unknown>();
  for (const entry of raw as unknown[]) {
    if (!isObject(entry) || typeof entry.lineId !== "string") return fail(INVALID);
    byLine.set(entry.lineId, entry.quantity);
  }
  if (byLine.size !== ctx.lineIds.length || ctx.lineIds.some((id) => !byLine.has(id))) return fail("Isi jumlah kirim semua barang.");
  const value: { lineId: string; quantity: number }[] = [];
  for (const lineId of ctx.lineIds) {
    const quantity = byLine.get(lineId);
    if (!isWhole(quantity, 0, SEND_MAX)) return fail("Jumlah kirim harus bilangan bulat 0 atau lebih.");
    value.push({ lineId, quantity });
  }
  if (value.every((entry) => entry.quantity === 0)) return fail("Isi jumlah kirim minimal satu barang, atau tolak permintaan ini.");
  return { ok: true, value };
}

export function validateRejectReason(raw: unknown): Validation<string> {
  const reason = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (reason.length < 2 || reason.length > 200) return fail("Alasan penolakan 2–200 karakter.");
  return { ok: true, value: reason };
}

/** Barang di draf tagihan yang jumlahnya melebihi stok meja (spec stok meja 4.1). Barang di luar `available` dilewati. */
export function counterShortages(
  lines: readonly { kind: string; itemId: string | null; quantity: number }[],
  available: ReadonlyMap<string, number>,
): Map<string, { needed: number; available: number }> {
  const needed = new Map<string, number>();
  for (const line of lines) {
    if (line.kind !== "BARANG" || !line.itemId || !available.has(line.itemId)) continue;
    needed.set(line.itemId, (needed.get(line.itemId) ?? 0) + line.quantity);
  }
  const short = new Map<string, { needed: number; available: number }>();
  for (const [itemId, total] of needed) {
    const have = available.get(itemId) ?? 0;
    if (total > have) short.set(itemId, { needed: total, available: have });
  }
  return short;
}

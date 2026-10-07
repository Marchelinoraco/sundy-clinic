import { MAX_QUANTITY, type Validation } from "./stock";

// Aturan murni penyerahan obat (spec penyerahan). Dipakai server dan browser; tanpa akses basis data.

export type DispensingStatusValue = "MENUNGGU" | "SELESAI" | "TANPA_OBAT";
export type DispensingView = DispensingStatusValue;

export const DISPENSING_STATUS_LABEL: Record<DispensingStatusValue, string> = {
  MENUNGGU: "Menunggu",
  SELESAI: "Selesai",
  TANPA_OBAT: "Tanpa obat",
};
export const DISPENSING_VIEWS = Object.keys(DISPENSING_STATUS_LABEL) as DispensingView[];

export function isDispensingView(value: unknown): value is DispensingView {
  return typeof value === "string" && (DISPENSING_VIEWS as string[]).includes(value);
}

export const USAGE_MAX = 200;
export const HOLD_MESSAGE = "Menunggu Apoteker menyerahkan obat.";

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

export type DispensingLineInput = { itemId: string; quantity: number; usage: string };

/** Satu baris obat dari formulir Apoteker (spec penyerahan 4.2). */
export function validateDispensingLine(raw: unknown): Validation<DispensingLineInput> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(INVALID_FORM);
  const row = raw as Record<string, unknown>;
  if (typeof row.itemId !== "string" || row.itemId === "" || row.itemId.length > 100) return fail("Pilih obat dari daftar.");
  const quantity = row.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return fail("Jumlah harus bilangan bulat lebih dari 0.");
  }
  const usage = typeof row.usage === "string" ? row.usage.trim() : row.usage === undefined || row.usage === null ? "" : null;
  if (usage === null) return fail(INVALID_FORM);
  if (usage === "") return fail("Isi aturan pakai.");
  if (usage.length > USAGE_MAX) return fail(`Aturan pakai paling banyak ${USAGE_MAX} karakter.`);
  return { ok: true, value: { itemId: row.itemId, quantity, usage } };
}

export type ItemQuantity = { itemId: string; itemName: string; quantity: number };

/** Jumlah per barang; barang yang sama di beberapa baris digabung, urutan kemunculan pertama. */
export function totalsByItem(lines: readonly ItemQuantity[]): ItemQuantity[] {
  const totals = new Map<string, ItemQuantity>();
  for (const line of lines) {
    const existing = totals.get(line.itemId);
    if (existing) existing.quantity += line.quantity;
    else totals.set(line.itemId, { ...line });
  }
  return [...totals.values()];
}

/** Barang pertama yang kebutuhannya melebihi stok tersedia, atau null bila semuanya cukup. */
export function stockShortage(
  needed: readonly ItemQuantity[],
  available: ReadonlyMap<string, number>,
): { itemName: string; available: number } | null {
  for (const line of needed) {
    const have = available.get(line.itemId) ?? 0;
    if (line.quantity > have) return { itemName: line.itemName, available: have };
  }
  return null;
}

export function shortageMessage(shortage: { itemName: string; available: number }): string {
  return `Stok ${shortage.itemName} tidak cukup (tersedia ${shortage.available}).`;
}

/** Pemberitahuan di editor tagihan (spec penyerahan 4.4); null bila kunjungan tidak punya penyerahan. */
export function dispensingNotice(status: DispensingStatusValue | null): string | null {
  switch (status) {
    case null:
      return null;
    case "MENUNGGU":
      return HOLD_MESSAGE;
    case "SELESAI":
      return "Obat sudah diserahkan.";
    case "TANPA_OBAT":
      return "Apoteker menandai tanpa obat.";
  }
}

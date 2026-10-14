/** Aturan resep dokter (spec resep dokter 3–4). Murni: dipakai formulir dan server. */
export const PRESCRIPTIONS_MAX = 30;
export const PRESCRIPTION_USAGE_MAX = 200;
const QUANTITY_MAX = 9999;

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** Satu baris resep apa adanya dari formulir (jumlah masih teks). */
export type PrescriptionInput = { itemId: string; quantity: string; usage: string };
export type PrescriptionDraft = { itemId: string; quantity: number; usage: string };

export function parsePrescriptions(rows: PrescriptionInput[]): Result<PrescriptionDraft[]> {
  if (rows.length > PRESCRIPTIONS_MAX) return { ok: false, message: `Paling banyak ${PRESCRIPTIONS_MAX} obat per resep.` };
  const value: PrescriptionDraft[] = [];
  for (const row of rows) {
    if (!row.itemId) return { ok: false, message: "Pilih obat dari daftar." };
    const text = row.quantity.trim();
    const quantity = Number(text);
    if (!/^\d+$/.test(text) || quantity < 1 || quantity > QUANTITY_MAX) return { ok: false, message: "Jumlah obat harus bilangan bulat 1–9.999." };
    const usage = row.usage.trim();
    if (!usage) return { ok: false, message: "Isi aturan pakai obat." };
    if (usage.length > PRESCRIPTION_USAGE_MAX) return { ok: false, message: `Aturan pakai terlalu panjang (maks. ${PRESCRIPTION_USAGE_MAX} karakter).` };
    value.push({ itemId: row.itemId, quantity, usage });
  }
  return { ok: true, value };
}

/** Obat yang bisa diresepkan: tanpa harga apa pun (spec resep dokter 7). */
export type MedicineOption = { id: string; code: string; name: string; unit: string; available: number };

/** Peringatan per obat bila jumlah semua barisnya melebihi sisa stok cabang (RD4: tidak menolak). */
export function stockWarnings(rows: { itemId: string; quantity: number }[], medicines: MedicineOption[]): Map<string, string> {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.quantity);
  const warnings = new Map<string, string>();
  for (const medicine of medicines) {
    const total = totals.get(medicine.id);
    if (total !== undefined && total > medicine.available) {
      warnings.set(medicine.id, `Sisa stok ${medicine.available} ${medicine.unit} — tagihan tertahan sampai stok cukup atau jumlah dikurangi.`);
    }
  }
  return warnings;
}

/**
 * Jumlah yang ditagih untuk baris resep, diubah resepsionis (RD5): 0 ≤ jumlah ≤ resep. Kurang dari resep wajib alasan
 * 2–200 karakter; sama dengan resep berarti kembali sesuai resep, alasannya tidak disimpan (`reason: null`).
 */
export function validateReduction(raw: unknown, ctx: { prescribed: number }): Result<{ quantity: number; reason: string | null }> {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const quantity = value.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity > ctx.prescribed) {
    return { ok: false, message: `Jumlah ditagih harus 0–${ctx.prescribed}.` };
  }
  if (quantity === ctx.prescribed) return { ok: true, value: { quantity, reason: null } };
  const reason = typeof value.reason === "string" ? value.reason.replace(/\s+/g, " ").trim() : "";
  if (reason.length < 2 || reason.length > 200) return { ok: false, message: "Alasan 2–200 karakter." };
  return { ok: true, value: { quantity, reason } };
}

/** Keterangan di catatan dokter bila resepsionis mengubah jumlah yang ditagih (spec resep dokter 4). */
export function billingLabel(line: { quantity: number; billedQuantity: number | null; billingNote: string | null }): string | null {
  if (line.billedQuantity === null) return null;
  if (line.billedQuantity === 0) return `Tidak ditagih — ${line.billingNote ?? ""}`;
  return `Ditagih ${line.billedQuantity} dari ${line.quantity} — ${line.billingNote ?? ""}`;
}

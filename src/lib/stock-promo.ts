import { formatDateWithYear, formatRupiah } from "./format";
import type { DiscountKindValue } from "./invoice";
import { dateOnlyString, isDateString, MAX_AMOUNT, type Validation } from "./stock";

// Diskon bawaan barang (spec perbaikan tagihan 3–5.1). Murni: dipakai server tagihan dan layar Stok.

export type PromoFields = {
  promoName: string | null;
  promoKind: DiscountKindValue | null;
  promoValue: number;
  promoStartsOn: Date | null;
  promoEndsOn: Date | null;
};

export type PromoInput = { name: string; kind: DiscountKindValue | null; value: number; startsOn: string; endsOn: string };

const NO_PROMO: PromoFields = { promoName: null, promoKind: null, promoValue: 0, promoStartsOn: null, promoEndsOn: null };
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });

/** Promo yang berlaku pada `today` ("YYYY-MM-DD", WITA), inklusif; sisi tanggal kosong tanpa batas. */
export function activePromo(item: PromoFields, today: string): { name: string; kind: DiscountKindValue; value: number } | null {
  if (!item.promoKind || item.promoValue <= 0 || !item.promoName) return null;
  if (item.promoStartsOn && dateOnlyString(item.promoStartsOn) > today) return null;
  if (item.promoEndsOn && dateOnlyString(item.promoEndsOn) < today) return null;
  return { name: item.promoName, kind: item.promoKind, value: item.promoValue };
}

/** Potongan promo untuk satu baris: persen dari harga baris (ke bawah), nominal per unit × jumlah, ≤ harga baris. */
export function promoDiscount(item: PromoFields, line: { quantity: number; unitPrice: number }, today: string): { amount: number; reason: string } | null {
  const promo = activePromo(item, today);
  if (!promo) return null;
  const gross = line.quantity * line.unitPrice;
  const amount = promo.kind === "PERSEN" ? Math.floor((gross * promo.value) / 100) : Math.min(promo.value * line.quantity, gross);
  return amount > 0 ? { amount, reason: `Promo: ${promo.name}` } : null;
}

export function validatePromo(raw: unknown): Validation<PromoFields> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail("Data tidak sah. Muat ulang halaman lalu coba lagi.");
  const input = raw as Record<string, unknown>;
  if (input.kind === null || input.kind === undefined || input.kind === "") return { ok: true, value: NO_PROMO };
  if (input.kind !== "NOMINAL" && input.kind !== "PERSEN") return fail("Pilih jenis promo.");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return fail("Isi nama promo.");
  if (name.length > 60) return fail("Nama promo paling banyak 60 karakter.");
  const value = input.value;
  if (input.kind === "PERSEN" && !(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100)) return fail("Persen promo harus 1 sampai 100.");
  if (input.kind === "NOMINAL" && !(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_AMOUNT)) return fail("Nominal promo harus lebih dari 0.");
  const startsOn = input.startsOn === "" || input.startsOn === undefined || input.startsOn === null ? null : input.startsOn;
  const endsOn = input.endsOn === "" || input.endsOn === undefined || input.endsOn === null ? null : input.endsOn;
  if ((startsOn !== null && !isDateString(startsOn)) || (endsOn !== null && !isDateString(endsOn))) return fail("Tanggal promo tidak sah.");
  if (startsOn && endsOn && (endsOn as string) < (startsOn as string)) return fail("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  return {
    ok: true,
    value: {
      promoName: name,
      promoKind: input.kind,
      promoValue: value as number,
      promoStartsOn: startsOn ? new Date(`${startsOn}T00:00:00Z`) : null,
      promoEndsOn: endsOn ? new Date(`${endsOn}T00:00:00Z`) : null,
    },
  };
}

/** "Promo Oktober · 10% · 1 Okt 2026–31 Okt 2026" untuk daftar dan detail barang. */
export function promoLabel(item: PromoFields): string | null {
  if (!item.promoKind || !item.promoName) return null;
  const value = item.promoKind === "PERSEN" ? `${item.promoValue}%` : `${formatRupiah(item.promoValue)}/unit`;
  const from = item.promoStartsOn ? formatDateWithYear(item.promoStartsOn) : null;
  const to = item.promoEndsOn ? formatDateWithYear(item.promoEndsOn) : null;
  const period = from && to ? `${from}–${to}` : from ? `mulai ${from}` : to ? `sampai ${to}` : null;
  return [item.promoName, value, period].filter(Boolean).join(" · ");
}

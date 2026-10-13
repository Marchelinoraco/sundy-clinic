import { formatRupiah } from "./format";
import { MAX_AMOUNT, type Validation } from "./stock";

// Aturan murni harga modal, komisi pelaksana, dan margin (spec harga modal 5–7). Dipakai server dan browser.

export type CommissionKindValue = "NOMINAL" | "PERSEN";
export type ServiceCostInput = { materialCost: number; toolCost: number; commissionKind: CommissionKindValue | null; commissionValue: number };
export type CostedService = { promoPrice: number } & ServiceCostInput;

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

export function validateServiceCost(raw: unknown): Validation<ServiceCostInput> {
  if (typeof raw !== "object" || raw === null) return fail(INVALID_FORM);
  const input = raw as Record<string, unknown>;
  const kind = input.commissionKind === undefined || input.commissionKind === "" ? null : input.commissionKind;
  if (kind !== null && kind !== "NOMINAL" && kind !== "PERSEN") return fail(INVALID_FORM);
  if (!isWhole(input.materialCost, 0, MAX_AMOUNT)) return fail("Biaya bahan tidak sah.");
  if (!isWhole(input.toolCost, 0, MAX_AMOUNT)) return fail("Biaya alat tidak sah.");
  if (kind === "PERSEN" && !isWhole(input.commissionValue, 1, 100)) return fail("Komisi persen 1–100.");
  if (kind === "NOMINAL" && !isWhole(input.commissionValue, 1, MAX_AMOUNT)) return fail("Komisi rupiah tidak sah.");
  return {
    ok: true,
    value: { materialCost: input.materialCost as number, toolCost: input.toolCost as number, commissionKind: kind, commissionValue: kind ? (input.commissionValue as number) : 0 },
  };
}

function commissionPerSession(cost: ServiceCostInput, price: number): number {
  if (cost.commissionKind === "NOMINAL") return cost.commissionValue;
  if (cost.commissionKind === "PERSEN") return Math.floor((price * cost.commissionValue) / 100);
  return 0;
}

/** Biaya satu sesi melebihi harga jual: boleh disimpan, tetapi diberi peringatan (spec 5). */
export function costWarning(cost: ServiceCostInput, price: number): string | null {
  return cost.materialCost + cost.toolCost + commissionPerSession(cost, price) > price ? "Biaya melebihi harga jual." : null;
}

export function commissionLabel(kind: CommissionKindValue | null, value: number): string {
  if (kind === "NOMINAL") return `${formatRupiah(value)}/sesi`;
  if (kind === "PERSEN") return `${value}%`;
  return "tanpa komisi";
}

export function serviceCostSummary(cost: ServiceCostInput): string {
  return `bahan ${formatRupiah(cost.materialCost)} · alat ${formatRupiah(cost.toolCost)} · komisi ${commissionLabel(cost.commissionKind, cost.commissionValue)}`;
}

/** Salinan biaya baris treatment saat final (spec 6, M10): komisi persen dari harga katalog × jumlah, dibulatkan ke bawah. */
export function lineCosts(input: { quantity: number; hasPerformer: boolean; service: CostedService | null }): { materialCost: number; toolCost: number; commissionAmount: number } {
  const { quantity, service } = input;
  if (!service) return { materialCost: 0, toolCost: 0, commissionAmount: 0 };
  let commissionAmount = 0;
  if (input.hasPerformer && service.commissionKind === "NOMINAL") commissionAmount = service.commissionValue * quantity;
  if (input.hasPerformer && service.commissionKind === "PERSEN") commissionAmount = Math.floor((service.promoPrice * quantity * service.commissionValue) / 100);
  return { materialCost: service.materialCost * quantity, toolCost: service.toolCost * quantity, commissionAmount };
}

export function marginOf(input: { revenue: number; stockCost: number; materialCost: number; toolCost: number; commission: number }): number {
  return input.revenue - input.stockCost - input.materialCost - input.toolCost - input.commission;
}

/** Persen margin satu desimal; null bila pendapatan 0 (rencana keputusan 6). */
export function marginPercent(margin: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return Math.round((margin / revenue) * 1000) / 10;
}

/** Isian "Isi harga beli" (spec 4): semua baris faktur wajib terisi, tidak negatif. */
export function validatePurchasePrices(raw: unknown, ctx: { lineIds: readonly string[] }): Validation<{ lineId: string; unitCost: number }[]> {
  if (!Array.isArray(raw)) return fail(INVALID_FORM);
  const byLine = new Map<string, unknown>();
  for (const entry of raw as unknown[]) {
    if (typeof entry !== "object" || entry === null) return fail(INVALID_FORM);
    const { lineId, unitCost } = entry as Record<string, unknown>;
    if (typeof lineId !== "string") return fail(INVALID_FORM);
    byLine.set(lineId, unitCost);
  }
  if (byLine.size !== ctx.lineIds.length || ctx.lineIds.some((id) => !byLine.has(id) || byLine.get(id) === null || byLine.get(id) === undefined)) {
    return fail("Isi harga beli semua baris.");
  }
  const value: { lineId: string; unitCost: number }[] = [];
  for (const lineId of ctx.lineIds) {
    const unitCost = byLine.get(lineId);
    if (!isWhole(unitCost, 0, MAX_AMOUNT)) return fail("Harga beli tidak sah.");
    value.push({ lineId, unitCost });
  }
  return { ok: true, value };
}

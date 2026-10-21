import { formatRupiah } from "./format";
import { dateLabel, isDateString, MAX_AMOUNT, type Validation } from "./stock";
import { addDaysToDateString } from "./time";

// Aturan murni paket treatment (spec paket 3–7). Dipakai server dan browser; tanpa akses basis data.

export const PACKAGE_NAME_MAX = 120;
export const PACKAGE_DESCRIPTION_MAX = 500;
export const PACKAGE_VALID_DAYS_MAX = 3650;
export const PACKAGE_SESSIONS_MAX = 100;
/** Jumlah satuan barang per isi paket (spec paket barang PB1). */
export const PACKAGE_GOODS_MAX = 1000;
export const PACKAGE_REASON_MAX = 200;
const LAST_DATE = "2100-12-31";

export type PackageEntryKindValue = "BELI" | "PAKAI" | "BATAL_PAKAI" | "PERPANJANG" | "BATAL_PAKET";
export const PACKAGE_ENTRY_LABEL: Record<PackageEntryKindValue, string> = {
  BELI: "Beli",
  PAKAI: "Pakai",
  BATAL_PAKAI: "Batal pakai",
  PERPANJANG: "Perpanjang",
  BATAL_PAKET: "Paket dibatalkan",
};

export type PatientPackageState = "AKTIF" | "KEDALUWARSA" | "HABIS" | "DIBATALKAN";
export const PACKAGE_STATE_LABEL: Record<PatientPackageState, string> = {
  AKTIF: "Aktif",
  KEDALUWARSA: "Kedaluwarsa",
  HABIS: "Habis",
  DIBATALKAN: "Dibatalkan",
};

/** Isi paket: treatment (serviceId, jumlah sesi) atau barang stok (itemId, jumlah satuan) — spec paket barang PB1. */
export type TreatmentPackageInput = {
  name: string;
  price: number;
  validDays: number;
  description: string;
  items: { serviceId?: string; itemId?: string; sessions: number }[];
};
export type ValidTreatmentPackage = Omit<TreatmentPackageInput, "description" | "items"> & {
  description: string | null;
  items: { serviceId: string | null; itemId: string | null; sessions: number }[];
};

const INVALID_FORM = "Data tidak sah. Muat ulang halaman lalu coba lagi.";
const fail = <T>(message: string): Validation<T> => ({ ok: false, message });
const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const text = (value: unknown): string | null => (value === undefined || value === null ? "" : typeof value === "string" ? value.trim() : null);

export function validateTreatmentPackage(raw: unknown): Validation<ValidTreatmentPackage> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail(INVALID_FORM);
  const input = raw as Record<string, unknown>;
  const name = text(input.name);
  const description = text(input.description);
  if (name === null || description === null || !Array.isArray(input.items)) return fail(INVALID_FORM);
  if (!name) return fail("Isi nama paket.");
  if (name.length > PACKAGE_NAME_MAX) return fail(`Nama paket paling banyak ${PACKAGE_NAME_MAX} karakter.`);
  if (!isWhole(input.price, 0, MAX_AMOUNT)) return fail("Harga paket tidak sah.");
  if (!isWhole(input.validDays, 1, PACKAGE_VALID_DAYS_MAX)) return fail(`Masa berlaku 1–${PACKAGE_VALID_DAYS_MAX} hari.`);
  if (description.length > PACKAGE_DESCRIPTION_MAX) return fail(`Keterangan paling banyak ${PACKAGE_DESCRIPTION_MAX} karakter.`);
  if (input.items.length === 0) return fail("Tambahkan minimal satu isi paket.");
  const items: ValidTreatmentPackage["items"] = [];
  for (const raw of input.items as unknown[]) {
    if (typeof raw !== "object" || raw === null) return fail(INVALID_FORM);
    const item = raw as Record<string, unknown>;
    const goods = "itemId" in item && item.itemId !== undefined;
    if (goods && "serviceId" in item && item.serviceId !== undefined) return fail(INVALID_FORM);
    if (goods) {
      if (typeof item.itemId !== "string" || !item.itemId) return fail("Pilih barang.");
      if (!isWhole(item.sessions, 1, PACKAGE_GOODS_MAX)) return fail(`Jumlah barang 1–${PACKAGE_GOODS_MAX}.`);
      if (items.some((other) => other.itemId === item.itemId)) return fail("Barang yang sama tidak boleh dua kali.");
      items.push({ serviceId: null, itemId: item.itemId, sessions: item.sessions as number });
      continue;
    }
    if (typeof item.serviceId !== "string" || !item.serviceId) return fail("Pilih treatment.");
    if (!isWhole(item.sessions, 1, PACKAGE_SESSIONS_MAX)) return fail(`Jumlah sesi 1–${PACKAGE_SESSIONS_MAX}.`);
    if (items.some((other) => other.serviceId === item.serviceId)) return fail("Treatment yang sama tidak boleh dua kali.");
    items.push({ serviceId: item.serviceId, itemId: null, sessions: item.sessions as number });
  }
  return { ok: true, value: { name, price: input.price as number, validDays: input.validDays as number, description: description || null, items } };
}

/** Tanggal terakhir paket berlaku, inklusif: paket 1 hari berlaku di hari pembelian saja. */
export function packageExpiresOn(startsOn: string, validDays: number): string {
  return addDaysToDateString(startsOn, validDays - 1);
}

/** Satu isi paket: "4× Facial" untuk treatment, "30 kapsul Slimming" untuk barang. */
function contentLabel(item: { name: string; sessions: number; unit?: string | null }): string {
  return item.unit ? `${item.sessions} ${item.unit} ${item.name}` : `${item.sessions}× ${item.name}`;
}

export function packageContentsLabel(items: readonly { name: string; sessions: number; unit?: string | null }[]): string {
  return items.map(contentLabel).join(", ");
}

export function packageState(input: { status: "AKTIF" | "DIBATALKAN"; expiresOn: string; remaining: number }, today: string): PatientPackageState {
  if (input.status === "DIBATALKAN") return "DIBATALKAN";
  if (input.remaining <= 0) return "HABIS";
  if (input.expiresOn < today) return "KEDALUWARSA";
  return "AKTIF";
}

/**
 * Satu isi paket yang bisa dipakai di draf; `remaining` sudah dikurangi baris draf lain (rencana paket keputusan 6).
 * Paket customer punya `patientPackageItemId`; paket yang dibeli di draf yang sama punya `purchaseLineId` (baris PAKET-nya)
 * dan `patientPackageId` "baru:<purchaseLineId>" (spec paket barang PB3).
 */
export type PackageOption = {
  patientPackageItemId: string | null;
  purchaseLineId: string | null;
  patientPackageId: string;
  packageName: string;
  serviceId: string | null;
  itemId: string | null;
  /** Nama isi: treatment atau barang. */
  serviceName: string;
  /** Satuan barang; kosong untuk treatment. */
  unit: string | null;
  sessions: number;
  remaining: number;
  startsOn: string;
  expiresOn: string;
};

export const optionKey = (option: Pick<PackageOption, "patientPackageItemId" | "purchaseLineId" | "serviceId" | "itemId">): string =>
  option.patientPackageItemId ?? `baru:${option.purchaseLineId}:${option.serviceId ?? option.itemId}`;

/**
 * Paket yang bisa dipakai untuk baris ini, kedaluwarsa terdekat lebih dulu (spec paket 6): treatment dicocokkan
 * lewat layanan, barang lewat barang stok (spec paket barang PB4).
 */
export function packageOptionsFor(
  options: readonly PackageOption[],
  line: { kind: string; serviceId: string | null; itemId: string | null },
  quantity: number,
): PackageOption[] {
  const matches = (option: PackageOption) =>
    line.kind === "TREATMENT" ? line.serviceId !== null && option.serviceId === line.serviceId : line.kind === "BARANG" && line.itemId !== null && option.itemId === line.itemId;
  return options
    .filter((option) => matches(option) && option.remaining >= quantity)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.startsOn.localeCompare(b.startsOn) || optionKey(a).localeCompare(optionKey(b)));
}

/** "Sesi paket A · sisa 3 dari 5" untuk treatment, "Jatah paket A · sisa 20 dari 30 kapsul" untuk barang. */
export function sessionNote(input: { packageName: string; remaining: number; sessions: number; unit?: string | null }): string {
  return input.unit
    ? `Jatah paket ${input.packageName} · sisa ${input.remaining} dari ${input.sessions} ${input.unit}`
    : `Sesi paket ${input.packageName} · sisa ${input.remaining} dari ${input.sessions}`;
}

/** Teks satu pilihan paket di dialog "Pakai". */
export function packageTargetLabel(option: PackageOption): string {
  const left = option.unit ? `${option.remaining} ${option.unit}` : `${option.remaining}`;
  return option.purchaseLineId
    ? `${option.packageName} (dibeli di tagihan ini) · sisa ${left}`
    : `${option.packageName} · sisa ${left} · berlaku s.d. ${dateLabel(option.expiresOn)}`;
}

export function validateExtension(raw: unknown, ctx: { currentExpiresOn: string }): Validation<{ expiresOn: string; reason: string }> {
  if (typeof raw !== "object" || raw === null) return fail(INVALID_FORM);
  const input = raw as Record<string, unknown>;
  if (!isDateString(input.expiresOn)) return fail("Isi tanggal berlaku baru.");
  if (input.expiresOn > LAST_DATE) return fail("Tanggal berlaku tidak sah.");
  if (input.expiresOn <= ctx.currentExpiresOn) return fail(`Tanggal baru harus setelah ${dateLabel(ctx.currentExpiresOn)}.`);
  const reason = text(input.reason);
  if (reason === null) return fail(INVALID_FORM);
  if (!reason) return fail("Isi alasan perpanjangan.");
  if (reason.length > PACKAGE_REASON_MAX) return fail(`Alasan paling banyak ${PACKAGE_REASON_MAX} karakter.`);
  return { ok: true, value: { expiresOn: input.expiresOn, reason } };
}

/** Kotak info editor draf (spec paket 6): satu teks per paket, urutan seperti `options`. */
export function packageOptionsSummary(options: readonly PackageOption[]): string[] {
  const groups = new Map<string, PackageOption[]>();
  for (const option of options) groups.set(option.patientPackageId, [...(groups.get(option.patientPackageId) ?? []), option]);
  return [...groups.values()].map((items) => {
    const sessions = items.map((item) => (item.unit ? `${item.remaining} ${item.unit} ${item.serviceName}` : `${item.remaining} ${item.serviceName}`)).join(", ");
    if (items[0].purchaseLineId) return `${items[0].packageName} (dibeli di tagihan ini: ${sessions})`;
    return `${items[0].packageName} (sisa ${sessions}; berlaku s.d. ${dateLabel(items[0].expiresOn)})`;
  });
}

/**
 * Satu isi paket untuk hitungan biaya (spec paket informatif PI1): harga jual dan biaya per satuan. Treatment: total biaya
 * per sesi; barang: harga beli terakhir, `null` bila belum pernah diisi.
 */
export type PackageCostLine = { name: string; unitPrice: number | null; unitCost: number | null; quantity: number };
export type PackageCostSummary = {
  /** Harga jual semua isi bila dibeli satuan. */
  normalValue: number;
  /** Nilai normal − harga paket. */
  saving: number;
  /** Total biaya isi yang sudah diketahui. */
  cost: number;
  /** Semua isi punya biaya. */
  complete: boolean;
  /** Harga paket − biaya. */
  margin: number;
  /** Nama barang yang belum punya harga beli. */
  missing: string[];
};

/** Ringkasan di dialog paket (spec paket informatif PI2). */
export function packageCostSummary(price: number, lines: readonly PackageCostLine[]): PackageCostSummary {
  const normalValue = lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0);
  const cost = lines.reduce((sum, line) => sum + (line.unitCost ?? 0) * line.quantity, 0);
  const missing = lines.filter((line) => line.unitCost === null).map((line) => line.name);
  return { normalValue, saving: normalValue - price, cost, complete: missing.length === 0, margin: price - cost, missing };
}

/** Penyimpanan paket ditolak bila ada barang tanpa harga beli (PI4), lalu bila harga di bawah total biaya (PI3); sama dengan boleh. */
export function packagePriceError(price: number, summary: PackageCostSummary): string | null {
  if (summary.missing.length > 0) return `Harga beli ${summary.missing[0]} belum diisi. Isi di Stok → Barang masuk.`;
  if (summary.cost > price) return `Harga paket ${formatRupiah(price)} di bawah total biaya isi ${formatRupiah(summary.cost)}. Naikkan harga paket atau kurangi isinya.`;
  return null;
}

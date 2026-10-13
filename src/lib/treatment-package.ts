import { dateLabel, isDateString, MAX_AMOUNT, type Validation } from "./stock";
import { addDaysToDateString } from "./time";

// Aturan murni paket treatment (spec paket 3–7). Dipakai server dan browser; tanpa akses basis data.

export const PACKAGE_NAME_MAX = 120;
export const PACKAGE_DESCRIPTION_MAX = 500;
export const PACKAGE_VALID_DAYS_MAX = 3650;
export const PACKAGE_SESSIONS_MAX = 100;
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

export type TreatmentPackageInput = { name: string; price: number; validDays: number; description: string; items: { serviceId: string; sessions: number }[] };
export type ValidTreatmentPackage = Omit<TreatmentPackageInput, "description"> & { description: string | null };

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
  if (input.items.length === 0) return fail("Tambahkan minimal satu treatment.");
  const items: ValidTreatmentPackage["items"] = [];
  for (const raw of input.items as unknown[]) {
    if (typeof raw !== "object" || raw === null) return fail(INVALID_FORM);
    const item = raw as Record<string, unknown>;
    if (typeof item.serviceId !== "string" || !item.serviceId) return fail("Pilih treatment.");
    if (!isWhole(item.sessions, 1, PACKAGE_SESSIONS_MAX)) return fail(`Jumlah sesi 1–${PACKAGE_SESSIONS_MAX}.`);
    if (items.some((other) => other.serviceId === item.serviceId)) return fail("Treatment yang sama tidak boleh dua kali.");
    items.push({ serviceId: item.serviceId, sessions: item.sessions as number });
  }
  return { ok: true, value: { name, price: input.price as number, validDays: input.validDays as number, description: description || null, items } };
}

/** Tanggal terakhir paket berlaku, inklusif: paket 1 hari berlaku di hari pembelian saja. */
export function packageExpiresOn(startsOn: string, validDays: number): string {
  return addDaysToDateString(startsOn, validDays - 1);
}

export function packageContentsLabel(items: readonly { name: string; sessions: number }[]): string {
  return items.map((item) => `${item.sessions}× ${item.name}`).join(", ");
}

export function packageState(input: { status: "AKTIF" | "DIBATALKAN"; expiresOn: string; remaining: number }, today: string): PatientPackageState {
  if (input.status === "DIBATALKAN") return "DIBATALKAN";
  if (input.remaining <= 0) return "HABIS";
  if (input.expiresOn < today) return "KEDALUWARSA";
  return "AKTIF";
}

/** Satu item paket customer yang bisa dipakai di draf; `remaining` sudah dikurangi baris draf lain (rencana paket keputusan 6). */
export type PackageOption = {
  patientPackageItemId: string;
  patientPackageId: string;
  packageName: string;
  serviceId: string;
  serviceName: string;
  sessions: number;
  remaining: number;
  startsOn: string;
  expiresOn: string;
};

/** Paket yang bisa dipakai untuk treatment ini, kedaluwarsa terdekat lebih dulu (spec paket 6). */
export function packageOptionsFor(options: readonly PackageOption[], serviceId: string, quantity: number): PackageOption[] {
  return options
    .filter((option) => option.serviceId === serviceId && option.remaining >= quantity)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.startsOn.localeCompare(b.startsOn) || a.patientPackageItemId.localeCompare(b.patientPackageItemId));
}

export function sessionNote(input: { packageName: string; remaining: number; sessions: number }): string {
  return `Sesi paket ${input.packageName} · sisa ${input.remaining} dari ${input.sessions}`;
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

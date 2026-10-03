import { z } from "zod";
import { CLINIC_NAME } from "@/lib/clinic";
import { activityEntrySchema, type ActivityEntry } from "@/lib/kuis/v1/answers";
import { ACTIVITY_FIRST_HOUR, ACTIVITY_KINDS, ACTIVITY_LAST_HOUR } from "@/lib/kuis/v1/options";
import { firstName } from "@/lib/quiz-link";
import { addDaysToDateString, minutesToTimeLabel, witaDateString } from "@/lib/time";

/**
 * Food recall H-1 (spec rekam medis bagian 2): baris jam + jenis + isi seperti
 * "Aktivitas kemarin" kuis v1 (CI5), ditambah penanda siapa yang mengisi.
 */
export const FOOD_RECALL_MAX_ENTRIES = 40;

export const FOOD_RECALL_AUTHORS = ["CUSTOMER", "DOKTER"] as const;
export type FoodRecallAuthor = (typeof FOOD_RECALL_AUTHORS)[number];

export const foodRecallEntrySchema = activityEntrySchema.extend({ by: z.enum(FOOD_RECALL_AUTHORS) });
export type FoodRecallEntry = ActivityEntry & { by: FoodRecallAuthor };

export type EntriesValidation = { ok: true; entries: FoodRecallEntry[] } | { ok: false; message: string };

const FOOD_RECALL_EMPTY = "Tambahkan minimal satu catatan.";
const FOOD_RECALL_TOO_MANY = "Paling banyak 40 catatan.";
const FOOD_RECALL_INVALID = "Catatan tidak sah. Muat ulang halaman lalu coba lagi.";

const trimmedEntry = activityEntrySchema.transform((entry) => ({ ...entry, text: entry.text.trim() }));

function checkCount(raw: unknown): string | null {
  if (!Array.isArray(raw)) return FOOD_RECALL_INVALID;
  if (raw.length === 0) return FOOD_RECALL_EMPTY;
  if (raw.length > FOOD_RECALL_MAX_ENTRIES) return FOOD_RECALL_TOO_MANY;
  return null;
}

/** Kiriman customer lewat link: semua baris ditandai CUSTOMER. */
export function validateCustomerEntries(raw: unknown): EntriesValidation {
  const countProblem = checkCount(raw);
  if (countProblem) return { ok: false, message: countProblem };
  const parsed = z.array(trimmedEntry).safeParse(raw);
  if (!parsed.success || parsed.data.some((entry) => !entry.text)) return { ok: false, message: FOOD_RECALL_INVALID };
  return { ok: true, entries: parsed.data.map((entry) => ({ ...entry, by: "CUSTOMER" })) };
}

/**
 * Simpanan dokter (spec 5.3): baris yang dibawa dari isian customer tetap
 * CUSTOMER; baris tanpa penanda adalah tambahan dokter.
 */
export function validateStaffEntries(raw: unknown): EntriesValidation {
  const countProblem = checkCount(raw);
  if (countProblem) return { ok: false, message: countProblem };
  const parsed = z
    .array(activityEntrySchema.extend({ by: z.enum(FOOD_RECALL_AUTHORS).optional() }))
    .safeParse(raw);
  if (!parsed.success) return { ok: false, message: FOOD_RECALL_INVALID };
  const entries = parsed.data.map((entry) => ({ ...entry, text: entry.text.trim(), by: entry.by ?? ("DOKTER" as const) }));
  if (entries.some((entry) => !entry.text)) return { ok: false, message: FOOD_RECALL_INVALID };
  return { ok: true, entries };
}

/** Baris tersimpan; bentuk yang rusak dibaca kosong agar halaman dokter tidak gagal. */
export function parseStoredEntries(raw: unknown): FoodRecallEntry[] {
  const parsed = z.array(foodRecallEntrySchema).max(FOOD_RECALL_MAX_ENTRIES).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Tanggal "kemarin": tanggal booking (WITA) dikurangi satu hari. */
export function recallDateFor(bookingStart: Date): string {
  return addDaysToDateString(witaDateString(bookingStart), -1);
}

const longLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const shortLabel = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
const asDate = (recallDate: string) => new Date(`${recallDate}T00:00:00Z`);

/** "Jumat, 2 Oktober" — judul form customer dan tab dokter. */
export function recallDateLabel(recallDate: string): string {
  return longLabel.format(asDate(recallDate));
}

/** "Jumat, 2 Okt" — judul teks Salin ke S. */
export function recallDateShortLabel(recallDate: string): string {
  return shortLabel.format(asDate(recallDate));
}

export type FoodRecallRow = {
  hour: number;
  label: string;
  entries: { kindLabel: string; text: string; byDoctor: boolean }[];
};

/** Tabel 06.00–22.00 yang dilihat dokter; jam tanpa catatan tetap ada (komponen boleh menyembunyikannya). */
export function foodRecallRows(entries: readonly FoodRecallEntry[]): FoodRecallRow[] {
  const rows: FoodRecallRow[] = [];
  for (let hour = ACTIVITY_FIRST_HOUR; hour <= ACTIVITY_LAST_HOUR; hour++) {
    rows.push({
      hour,
      label: minutesToTimeLabel(hour * 60),
      entries: entries
        .filter((entry) => entry.hour === hour)
        .map((entry) => ({ kindLabel: ACTIVITY_KINDS[entry.kind], text: entry.text, byDoctor: entry.by === "DOKTER" })),
    });
  }
  return rows;
}

export function foodRecallHeader(recallDate: string): string {
  return `Food recall H-1 (${recallDateShortLabel(recallDate)})`;
}

/** Teks Salin ke S (spec 5.2): judul, lalu satu catatan per baris, terurut per jam. */
export function foodRecallSubjectiveText(recallDate: string, entries: readonly FoodRecallEntry[]): string {
  const lines = [...entries]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.hour - b.entry.hour || a.index - b.index)
    .map(({ entry }) => `${minutesToTimeLabel(entry.hour * 60)} ${ACTIVITY_KINDS[entry.kind]} — ${entry.text}`);
  return [`${foodRecallHeader(recallDate)}:`, ...lines].join("\n");
}

/** Ditambahkan di akhir S, dipisah satu baris kosong. */
export function appendToSubjective(current: string, block: string): string {
  return current.trim() ? `${current.trimEnd()}\n\n${block}` : block;
}

/** Centang otomatis "Tawarkan food recall" (spec 4.1). */
export function shouldOfferFoodRecall(input: { intakePurpose: string | null; hasActivePackage: boolean }): boolean {
  return input.intakePurpose === "SLIMMING" || input.intakePurpose === "GIZI_KLINIK" || input.hasActivePackage;
}

export type FoodRecallLinkState = "OPEN" | "CLOSED" | "RECEIVED";

/**
 * Masa berlaku link (spec 4.2). "RECEIVED" bila dokter sudah melengkapi atau
 * catatannya final; "CLOSED" bila booking bukan Hadir atau bukan tanggal booking.
 */
export function foodRecallLinkState(
  input: { appointmentStatus: string; startAt: Date; encounterStatus: "DRAF" | "FINAL" | null; completedAt: Date | null },
  now: Date,
): FoodRecallLinkState {
  if (input.completedAt || input.encounterStatus === "FINAL") return "RECEIVED";
  if (input.appointmentStatus !== "HADIR") return "CLOSED";
  return witaDateString(input.startAt) === witaDateString(now) ? "OPEN" : "CLOSED";
}

export const FOOD_RECALL_CLOSED = "Link sudah tidak berlaku. Silakan tanyakan ke resepsionis.";
export const FOOD_RECALL_RECEIVED = "Food recall Anda sudah diterima dokter.";

/** Pesan WA berisi link (spec 4.2). Hanya nama depan; tanpa NIK atau data lain. */
export function foodRecallMessageText(input: { patientName: string; link: string }): string {
  return [
    `Halo ${firstName(input.patientName)}, ini ${CLINIC_NAME}. Mohon catat apa saja yang Anda makan, minum, dan lakukan kemarin sebelum konsultasi (±3 menit): ${input.link}`,
    "Catatan ini hanya dibaca dokter kami.",
  ].join("\n");
}

/** Link food recall sebuah booking untuk panel admin. */
export type FoodRecallLinkInfo =
  | { state: "NOT_OFFERED" }
  | { state: "OPEN"; filled: boolean; url: string; message: { text: string; link: string | null } }
  | { state: "CLOSED" | "RECEIVED"; filled: boolean };

/** Isi halaman /food-recall untuk customer: hanya nama depan dan tanggal kemarin. */
export type FoodRecallPage =
  | { state: "OPEN"; firstName: string; recallDateLabel: string }
  | { state: "CLOSED" }
  | { state: "RECEIVED" };

/** Food recall di halaman kunjungan dokter (spec bagian 5). */
export type FoodRecallView = {
  appointmentId: string;
  state: "NOT_OFFERED" | "WAITING" | "FILLED";
  recallDate: string;
  recallDateLabel: string;
  entries: FoodRecallEntry[];
  submittedAt: Date | null;
  completedAt: Date | null;
  completedByName: string | null;
};

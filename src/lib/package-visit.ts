import { formatIndonesianDate } from "./format";
import { firstName } from "./quiz-link";
import { dateLabel, isDateString, type Validation } from "./stock";
import { addDaysToDateString } from "./time";

// Rencana kunjungan paket (spec jadwal paket JP3, JP13, JP16). Murni: dipakai server dan browser.

/** Satu isi paket untuk rencana: `perVisit` kosong = treatment (1 sesi per kunjungan). */
export type VisitItem = { name: string; unit: string | null; remaining: number; perVisit: number | null };
export type VisitContent = { name: string; unit: string | null; quantity: number };
export type PlannedVisit = { number: number; date: string; contents: VisitContent[] };

/**
 * Kunjungan berikutnya sampai semua sisa habis: tiap kunjungan 1 sesi tiap treatment yang bersisa, ditambah jumlah per
 * kunjungan tiap barang (atau sisanya bila kurang), setiap `intervalDays` hari mulai `nextVisitOn`.
 */
export function planVisits(input: { nextVisitOn: string | null; intervalDays: number; visitsDone: number; items: readonly VisitItem[] }): PlannedVisit[] {
  if (!input.nextVisitOn) return [];
  const left = input.items.map((item) => item.remaining);
  const visits: PlannedVisit[] = [];
  let date = input.nextVisitOn;
  while (left.some((value) => value > 0)) {
    const contents: VisitContent[] = [];
    input.items.forEach((item, index) => {
      const quantity = Math.min(item.perVisit ?? 1, left[index]);
      if (quantity <= 0) return;
      left[index] -= quantity;
      contents.push({ name: item.name, unit: item.unit, quantity });
    });
    visits.push({ number: input.visitsDone + visits.length + 1, date, contents });
    date = addDaysToDateString(date, input.intervalDays);
  }
  return visits;
}

/** "Facial Brightening, 7 kapsul Slimming Capsule". */
export function visitContentsLabel(contents: readonly VisitContent[]): string {
  return contents.map((content) => (content.unit ? `${content.quantity} ${content.unit} ${content.name}` : content.name)).join(", ");
}

/** Jumlah barang per kunjungan bawaan: dibagi rata dengan sesi treatment terbanyak, atau semuanya bila tanpa treatment (JP15). */
export function defaultPerVisit(goodsTotal: number, maxTreatmentSessions: number): number {
  return Math.ceil(goodsTotal / Math.max(1, maxTreatmentSessions));
}

/**
 * Pesan WhatsApp pengingat kunjungan paket (JP13). Rencana yang sudah lewat tidak disebut sebagai jadwal: pasien diajak
 * memilih hari dan jam baru.
 */
export function packageVisitMessage(input: { patientName: string; packageName: string; visitNumber: number; visitOn: string; today: string; contents: readonly VisitContent[] }): string {
  const greeting = `Halo ${firstName(input.patientName)}, ini SunDY Clinic. Sesuai program paket ${input.packageName},`;
  const date = formatIndonesianDate(new Date(`${input.visitOn}T00:00:00Z`));
  const isi = visitContentsLabel(input.contents);
  if (input.visitOn < input.today) {
    return `${greeting} sudah waktunya kunjungan ke-${input.visitNumber} Anda (rencana ${date}): ${isi}. Balas pesan ini untuk memilih hari dan jam ya. Terima kasih.`;
  }
  const when = input.visitOn === input.today ? "hari ini" : input.visitOn === addDaysToDateString(input.today, 1) ? "besok" : `pada ${date}`;
  return `${greeting} jadwal kunjungan ke-${input.visitNumber} Anda ${when}: ${isi}. Balas pesan ini untuk memilih jam ya. Terima kasih.`;
}

/** Tanggal kunjungan berikutnya yang diubah resepsionis (JP9, JP16). */
export function validatePlanDate(raw: unknown, ctx: { today: string; expiresOn: string }): Validation<string> {
  if (!isDateString(raw)) return { ok: false, message: "Isi tanggal rencana." };
  if (raw < ctx.today) return { ok: false, message: "Tanggal rencana tidak boleh sebelum hari ini." };
  if (raw > ctx.expiresOn) return { ok: false, message: `Tanggal rencana melewati masa berlaku paket (${dateLabel(ctx.expiresOn)}).` };
  return { ok: true, value: raw };
}

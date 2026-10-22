import { VITAL_KEYS, bloodPressureProblem, parseVital, type Parsed, type VitalKey } from "./encounter";
import { minutesToTimeLabel, witaDateString, witaMinutesOfDay } from "./time";

// Angka vital perawat (spec vital perawat VP1–VP6). Murni: dipakai halaman dan server.

const INVALID = "Isian tidak sah. Muat ulang halaman lalu coba lagi.";

/** Dokter menunggu perawat hanya untuk kunjungan klinik hari ini (WITA) yang belum dibuka dokter (VP4). */
export function nurseGateApplies(visit: { channel: "KLINIK" | "ONLINE"; startAt: Date; hasEncounter: boolean }, today: string): boolean {
  return visit.channel === "KLINIK" && !visit.hasEncounter && witaDateString(visit.startAt) >= today;
}

/** "Diukur perawat Rina · 09.15", ditambah " · diubah dokter" bila dokter mengganti angka mana pun (VP6). */
export function nurseVitalsLabel(input: { byName: string; at: Date; changedByDoctor: boolean }): string {
  const time = minutesToTimeLabel(witaMinutesOfDay(input.at));
  return `Diukur perawat ${input.byName} · ${time}${input.changedByDoctor ? " · diubah dokter" : ""}`;
}

/** Isian perawat (teks per angka vital) → angka, dengan batas dan pesan yang sama dengan formulir dokter (VP1). */
export function parseNurseVitals(raw: unknown): Parsed<Record<VitalKey, number | null>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, message: INVALID };
  const input = raw as Record<string, unknown>;
  const values = {} as Record<VitalKey, number | null>;
  for (const key of VITAL_KEYS) {
    const text = input[key] ?? "";
    if (typeof text !== "string" || text.length > 20) return { ok: false, message: INVALID };
    const parsed = parseVital(key, text);
    if (!parsed.ok) return parsed;
    values[key] = parsed.value;
  }
  const pressure = bloodPressureProblem(values.systolic, values.diastolic);
  return pressure ? { ok: false, message: pressure } : { ok: true, value: values };
}

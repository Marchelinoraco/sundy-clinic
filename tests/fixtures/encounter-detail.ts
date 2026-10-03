import { emptyDraftInput, type VitalKey } from "@/lib/encounter";
import type { EncounterDetail, EncounterHistoryItem } from "@/server/encounter-read";

export const NO_VITALS: Record<VitalKey, number | null> = {
  systolic: null,
  diastolic: null,
  pulse: null,
  temperatureC: null,
  weightKg: null,
  heightCm: null,
  waistCm: null,
};

/** Kunjungan final contoh: Rabu 23 Sep 2026, 11.00 WITA. */
export function historyItem(patch: Partial<EncounterHistoryItem> = {}): EncounterHistoryItem {
  return {
    id: "h1",
    startAt: new Date("2026-09-23T03:00:00Z"),
    branchName: "SunDY Mahakeret",
    authorName: "dr. Diane",
    subjective: "Nafsu makan malam masih tinggi",
    physicalExam: null,
    assessment: "Obesitas derajat 1",
    plan: "Program MAX, kontrol 1 minggu",
    vitals: { ...NO_VITALS, weightKg: 73.3, heightCm: 158, systolic: 130, diastolic: 85 },
    vitalLines: ["Tekanan darah: 130/85 mmHg", "Berat badan: 73,3 kg", "Tinggi badan: 158 cm", "IMT 29,4"],
    assessmentPreview: "Obesitas derajat 1",
    treatments: [{ serviceName: "Meso", area: "Perut", dose: null, performerName: "dr. Diane", notes: null }],
    addenda: [],
    ...patch,
  };
}

/** Kunjungan draf contoh tanpa isian dan tanpa riwayat. */
export function encounterDetail(patch: Partial<EncounterDetail> = {}): EncounterDetail {
  return {
    id: "e1",
    status: "DRAF",
    version: "2026-10-01T02:00:00.000Z",
    createdByName: "dr. Diane",
    finalized: null,
    appointment: {
      id: "a1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-01T07:00:00Z"),
      serviceName: "Konsultasi Dokter",
      staffName: "dr. Diane",
      branchName: "SunDY Mahakeret",
    },
    patient: { id: "p1", name: "Siti Rahayu", medicalRecordNumber: "SDY-2026-0001", ageLabel: "34 tahun", genderLabel: "Perempuan" },
    warnings: { allergies: "Udang", medicalHistory: null, importantNotes: "Takut jarum", paperRecordNumber: "RM-0457", pregnancy: true },
    intake: null,
    draft: emptyDraftInput(),
    vitalLines: [],
    vitals: { ...NO_VITALS },
    treatments: [],
    addenda: [],
    options: {
      services: [{ id: "s1", name: "Konsultasi Dokter" }],
      performers: [{ id: "d1", name: "dr. Diane" }],
      defaultServiceId: "s1",
      defaultPerformerId: "d1",
    },
    trail: null,
    history: [],
    hasMoreHistory: false,
    approval: null,
    foodRecall: {
      appointmentId: "a1",
      state: "NOT_OFFERED",
      recallDate: "2026-09-30",
      recallDateLabel: "Rabu, 30 September",
      entries: [],
      submittedAt: null,
      completedAt: null,
      completedByName: null,
    },
    ...patch,
  };
}

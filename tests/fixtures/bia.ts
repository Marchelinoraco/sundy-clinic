import { EMPTY_BIA_NUMBERS } from "@/lib/bia";
import type { BiaMeasurementView, BiaVisitView } from "@/server/bia-read";

export function biaMeasurement(patch: Partial<BiaMeasurementView> = {}): BiaMeasurementView {
  return {
    id: "m1",
    version: 1,
    createdAt: new Date("2026-10-09T02:40:00Z"),
    createdByName: "Rina",
    appointmentId: "a1",
    appointmentCode: "SDY-8F3K",
    numbers: { ...EMPTY_BIA_NUMBERS },
    note: null,
    numbersAt: null,
    numbersByName: null,
    voided: null,
    files: [],
    ...patch,
  };
}

export function biaVisit(patch: Partial<BiaVisitView> = {}): BiaVisitView {
  return {
    active: null,
    voided: [],
    access: { upload: true, editNumbers: true, voidAny: true, voidOwnFile: true, view: true },
    final: false,
    points: [],
    ...patch,
  };
}

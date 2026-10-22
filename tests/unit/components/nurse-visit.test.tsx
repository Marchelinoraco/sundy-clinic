import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NurseVisitView } from "@/components/admin/nurse/nurse-visit";
import type { NurseVisit } from "@/server/nurse";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/food-recall-admin", () => ({ saveFoodRecallByStaff: vi.fn(), saveFoodRecallByNurse: vi.fn(), getFoodRecallLink: vi.fn(), offerFoodRecall: vi.fn() }));
vi.mock("@/server/nurse-vitals", () => ({ saveNurseVitals: vi.fn(), completeNurseVisit: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/bia-actions", () => ({ saveBiaNumbers: vi.fn(), startBiaMeasurement: vi.fn(), voidBiaFile: vi.fn(), voidBiaMeasurement: vi.fn() }));

const VISIT: NurseVisit = {
  appointmentId: "a1",
  code: "SDY-AB12",
  startAt: new Date("2026-10-20T03:00:00Z"),
  serviceName: "Konsultasi gizi",
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  patient: { name: "Mario Sului", medicalRecordNumber: "SDY-2026-0013", allergies: "Udang" },
  foodRecall: { appointmentId: "a1", state: "NOT_OFFERED", recallDate: "2026-10-19", recallDateLabel: "Senin, 19 Oktober", entries: [], submittedAt: null, completedAt: null, completedByName: null, version: null },
  bia: { active: null, voided: [], access: { upload: true, editNumbers: true, voidAny: false, voidOwnFile: true, view: false }, final: false, points: [] },
  vitals: { inputs: { systolic: "", diastolic: "", pulse: "", temperatureC: "", weightKg: "", heightCm: "", waistCm: "" }, version: null, completed: null },
};

describe("NurseVisitView (spec peran perawat 7)", () => {
  it("kepala, alergi, food recall, dan BIA — tanpa bagian klinis lain", () => {
    renderAdmin(<NurseVisitView visit={VISIT} />);
    expect(screen.getByRole("heading", { name: "Mario Sului" })).toBeInTheDocument();
    expect(screen.getByText(/SDY-2026-0013/)).toBeInTheDocument();
    expect(screen.getByText(/11\.00 · Konsultasi gizi · dr\. Diane · SunDY Mahakeret/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Peringatan" })).toHaveTextContent("Udang");
    // Angka vital di atas food recall (spec vital perawat VP1).
    const regions = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label") ?? region.getAttribute("aria-labelledby"));
    expect(regions.indexOf("Angka vital")).toBeGreaterThanOrEqual(0);
    expect(regions.indexOf("Angka vital")).toBeLessThan(regions.indexOf("Food recall"));
    expect(screen.getByRole("region", { name: "Food recall" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "BIA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Isi food recall" })).toBeInTheDocument();
    expect(screen.queryByText(/Diagnosis|Resep|Riwayat/)).toBeNull();
  });

  it("tanpa alergi: kotak peringatan tidak tampil", () => {
    renderAdmin(<NurseVisitView visit={{ ...VISIT, patient: { ...VISIT.patient, allergies: null } }} />);
    expect(screen.queryByRole("region", { name: "Peringatan" })).toBeNull();
  });
});

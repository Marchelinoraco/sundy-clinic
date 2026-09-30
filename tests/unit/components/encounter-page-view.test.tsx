import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EncounterPageView } from "@/components/admin/encounter-page-view";
import { emptyDraftInput } from "@/lib/encounter";
import type { EncounterDetail } from "@/server/encounter-read";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/encounter", () => ({
  saveEncounterDraft: vi.fn(),
  finalizeEncounter: vi.fn(),
  discardEncounterDraft: vi.fn(),
  addEncounterAddendum: vi.fn(),
}));

const base: EncounterDetail = {
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
  treatments: [],
  addenda: [],
  options: { services: [{ id: "s1", name: "Konsultasi Dokter" }], performers: [{ id: "d1", name: "dr. Diane" }], defaultServiceId: "s1", defaultPerformerId: "d1" },
  trail: null,
  vitals: { systolic: null, diastolic: null, pulse: null, temperatureC: null, weightKg: null, heightCm: null, waistCm: null },
  history: [],
  hasMoreHistory: false,
  approval: null,
};

const final: EncounterDetail = {
  ...base,
  status: "FINAL",
  finalized: { byName: "dr. Diane", at: new Date("2026-10-01T08:00:00Z") },
  draft: { ...emptyDraftInput(), subjective: "Berat naik", assessment: "Obesitas derajat 1", plan: "Program MAX" },
  vitalLines: ["Tekanan darah: 120/80 mmHg", "IMT 28,3"],
  treatments: [{ serviceName: "Meso", area: "Perut", dose: null, performerName: "dr. Diane", notes: null }],
  addenda: [{ id: "ad1", text: "Tensi diukur ulang: 118/78.", authorName: "dr. Diane", createdAt: new Date("2026-10-02T01:00:00Z") }],
};

describe("EncounterPageView", () => {
  it("menampilkan identitas dan semua peringatan", () => {
    render(<EncounterPageView encounter={base} canWrite />);
    expect(screen.getByRole("heading", { name: "Siti Rahayu" })).toBeInTheDocument();
    expect(screen.getByText(/SDY-2026-0001 · 34 tahun · Perempuan/)).toBeInTheDocument();
    const warnings = screen.getByRole("region", { name: "Peringatan" });
    expect(within(warnings).getByText("Udang")).toBeInTheDocument();
    expect(within(warnings).getByText("Takut jarum")).toBeInTheDocument();
    expect(within(warnings).getByText("Hamil, merencanakan kehamilan, atau menyusui (dari isian kunjungan ini)")).toBeInTheDocument();
    expect(within(warnings).getByText("Ada berkas kertas: RM-0457")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data pasien" })).toHaveAttribute("href", "/admin/pasien/p1");
  });

  it("menyebut bila alergi dan riwayat penyakit belum dicatat", () => {
    render(
      <EncounterPageView
        encounter={{ ...base, warnings: { allergies: null, medicalHistory: null, importantNotes: null, paperRecordNumber: null, pregnancy: false } }}
        canWrite
      />,
    );
    expect(screen.getByText("Alergi dan riwayat penyakit belum dicatat.")).toBeInTheDocument();
  });

  it("draf untuk penulis: formulir tampil, tanpa bagian adendum", () => {
    render(<EncounterPageView encounter={base} canWrite />);
    expect(screen.getByLabelText("Keluhan dan anamnesis dokter")).toBeInTheDocument();
    expect(screen.getByText("Draf")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Adendum" })).not.toBeInTheDocument();
  });

  it("final: baca-saja dengan tanda vital, treatment, adendum, dan formulir adendum", () => {
    render(<EncounterPageView encounter={final} canWrite />);
    expect(screen.queryByLabelText("Keluhan dan anamnesis dokter")).not.toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.getByText("Tekanan darah: 120/80 mmHg")).toBeInTheDocument();
    expect(screen.getByText("Obesitas derajat 1")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Meso" })).toBeInTheDocument();
    expect(screen.getByText(/Difinalisasi oleh dr\. Diane/)).toBeInTheDocument();
    const addenda = screen.getByRole("region", { name: "Adendum" });
    expect(within(addenda).getByText("Tensi diukur ulang: 118/78.")).toBeInTheDocument();
    expect(within(addenda).getByLabelText("Isi adendum")).toBeInTheDocument();
  });

  it("jejak catatan hanya tampil bila diberikan (Super Admin)", () => {
    const { unmount } = render(<EncounterPageView encounter={final} canWrite />);
    expect(screen.queryByText("Jejak catatan ini")).not.toBeInTheDocument();
    unmount();

    render(
      <EncounterPageView
        encounter={{
          ...final,
          trail: [{ id: "t1", at: new Date("2026-10-01T08:00:00Z"), actorName: "dr. Diane", roleLabel: "Dokter", actionLabel: "memfinalisasi" }],
        }}
        canWrite
      />,
    );
    expect(screen.getByText("Jejak catatan ini")).toBeInTheDocument();
    expect(screen.getByText("memfinalisasi")).toBeInTheDocument();
  });

  it("isian kuis di bagian S: belum diisi, galat versi, dan siap dengan tautan persetujuan", () => {
    const { unmount } = render(<EncounterPageView encounter={{ ...base, intake: { id: "i1", state: "pending" } }} canWrite />);
    expect(screen.getByText("Isian belum diisi pasien.")).toBeInTheDocument();
    unmount();

    const second = render(
      <EncounterPageView
        encounter={{ ...base, intake: { id: "i1", state: "error", message: "Isian dengan kuis versi 9 belum bisa ditampilkan." } }}
        canWrite
      />,
    );
    expect(screen.getByText(/Isian dengan kuis versi 9 belum bisa ditampilkan\./)).toBeInTheDocument();
    second.unmount();

    render(
      <EncounterPageView
        encounter={{
          ...base,
          intake: {
            id: "i1",
            state: "ready",
            needsApproval: true,
            kind: "LENGKAP",
            purposeLabel: "Slimming",
            submittedAt: null,
            clinical: { sections: [{ title: "Kesehatan", lines: ["Diabetes: Metformin"] }], activities: null, activityDateLabel: null, habits: null },
          },
        }}
        canWrite
      />,
    );
    expect(screen.getByText("Diabetes: Metformin")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setujui ke data pasien" })).toHaveAttribute("href", "/admin/isian/i1");
  });
});

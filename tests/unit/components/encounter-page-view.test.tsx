import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EncounterPageView } from "@/components/admin/encounter-page-view";
import { emptyDraftInput } from "@/lib/encounter";
import { encounterDetail, historyItem } from "../../fixtures/encounter-detail";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/encounter", () => ({
  saveEncounterDraft: vi.fn(),
  finalizeEncounter: vi.fn(),
  discardEncounterDraft: vi.fn(),
  addEncounterAddendum: vi.fn(),
}));
vi.mock("@/server/intake", () => ({ approveIntakeToPatient: vi.fn() }));
vi.mock("@/server/food-recall-admin", () => ({
  saveFoodRecallByStaff: vi.fn(),
  getFoodRecallLink: vi.fn(),
  offerFoodRecall: vi.fn(),
}));

const final = encounterDetail({
  status: "FINAL",
  finalized: { byName: "dr. Diane", at: new Date("2026-10-01T08:00:00Z") },
  draft: { ...emptyDraftInput(), subjective: "Berat naik", assessment: "Obesitas derajat 1", plan: "Program MAX" },
  vitalLines: ["Tekanan darah: 120/80 mmHg", "IMT 28,3"],
  treatments: [{ serviceName: "Meso", area: "Perut", dose: null, performerName: "dr. Diane", notes: null }],
  addenda: [{ id: "ad1", text: "Tensi diukur ulang: 118/78.", authorName: "dr. Diane", createdAt: new Date("2026-10-02T01:00:00Z") }],
});

describe("EncounterPageView", () => {
  it("kepala satu baris dan peringatan di kolom kiri", () => {
    render(<EncounterPageView encounter={encounterDetail()} canWrite />);
    expect(screen.getByRole("heading", { name: "Siti Rahayu" })).toBeInTheDocument();
    expect(screen.getByText(/SDY-2026-0001 · 34 tahun · Perempuan · .*SunDY Mahakeret/)).toBeInTheDocument();
    const aside = screen.getByRole("complementary", { name: "Konteks kunjungan" });
    const warnings = within(aside).getByRole("region", { name: "Peringatan" });
    expect(within(warnings).getByText("Takut jarum")).toBeInTheDocument();
    expect(within(warnings).getByText("Ada berkas kertas: RM-0457")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data pasien" })).toHaveAttribute("href", "/admin/pasien/p1");
  });

  it("draf untuk penulis: formulir di kolom kanan dengan bar aksi, tanpa bagian adendum", () => {
    render(<EncounterPageView encounter={encounterDetail()} canWrite />);
    expect(screen.getByLabelText("Keluhan dan anamnesis dokter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalisasi" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Adendum" })).not.toBeInTheDocument();
  });

  it("final: baca-saja, adendum, dan bar 'Final · difinalisasi oleh'", () => {
    render(<EncounterPageView encounter={final} canWrite />);
    expect(screen.queryByLabelText("Keluhan dan anamnesis dokter")).not.toBeInTheDocument();
    expect(screen.getByText("Tekanan darah: 120/80 mmHg")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Meso" })).toBeInTheDocument();
    expect(screen.getByText(/Final · difinalisasi oleh dr\. Diane/)).toBeInTheDocument();
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
        encounter={{ ...final, trail: [{ id: "t1", at: new Date("2026-10-01T08:00:00Z"), actorName: "dr. Diane", roleLabel: "Dokter", actionLabel: "memfinalisasi" }] }}
        canWrite
      />,
    );
    expect(screen.getByText("Jejak catatan ini")).toBeInTheDocument();
  });

  it("mengetik berat langsung mengubah baris Kunjungan ini di tab Tren", async () => {
    render(<EncounterPageView encounter={encounterDetail({ history: [historyItem()] })} canWrite />);
    await userEvent.type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    await userEvent.click(screen.getByRole("tab", { name: "Tren" }));
    const rows = within(screen.getByRole("table", { name: "Tren tanda vital" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Kunjungan ini");
    expect(rows[1]).toHaveTextContent("72,5");
  });

  it("memuat ulang halaman (mis. setelah persetujuan isian) tidak menghapus ketikan yang belum tersimpan", async () => {
    const { rerender } = render(<EncounterPageView encounter={encounterDetail()} canWrite />);
    await userEvent.type(screen.getByLabelText("Penilaian / diagnosis"), "Obesitas");
    rerender(
      <EncounterPageView
        encounter={encounterDetail({ version: "2026-10-01T02:05:00.000Z", warnings: { ...encounterDetail().warnings, allergies: "Udang\nAmoxicillin" } })}
        canWrite
      />,
    );
    expect(screen.getByLabelText("Penilaian / diagnosis")).toHaveValue("Obesitas");
    expect(within(screen.getByRole("region", { name: "Peringatan" })).getByText(/Amoxicillin/)).toBeInTheDocument();
  });

  it("food recall yang sudah diisi terbuka lebih dulu, dan Salin ke S menambahkannya ke kolom S", async () => {
    const user = userEvent.setup();
    const encounter = encounterDetail({
      draft: { ...emptyDraftInput(), subjective: "BB naik 1 kg" },
      foodRecall: {
        appointmentId: "a1",
        state: "FILLED",
        recallDate: "2026-09-30",
        recallDateLabel: "Rabu, 30 September",
        entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" }],
        submittedAt: new Date("2026-10-01T02:30:00Z"),
        completedAt: null,
        completedByName: null,
      },
    });
    render(<EncounterPageView encounter={encounter} canWrite />);
    expect(screen.getByRole("tab", { name: "Food recall" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(screen.getByLabelText("Keluhan dan anamnesis dokter")).toHaveValue(
      "BB naik 1 kg\n\nFood recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi kuning",
    );
  });
});

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EncounterContextPanel } from "@/components/admin/encounter-context-panel";
import { NO_VITALS, encounterDetail, historyItem } from "../../fixtures/encounter-detail";
import { biaVisit } from "../../fixtures/bia";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/bia-actions", () => ({
  saveBiaNumbers: vi.fn(),
  startBiaMeasurement: vi.fn(),
  voidBiaMeasurement: vi.fn(),
  voidBiaFile: vi.fn(),
}));
vi.mock("@/components/admin/bia/send-files", () => ({ sendBiaFile: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Formulir persetujuan memanggil server action dari modul ini.
vi.mock("@/server/intake", () => ({ approveIntakeToPatient: vi.fn() }));
// Tab Food recall tetap terpasang (hanya disembunyikan) dan memanggil server action ini.
vi.mock("@/server/food-recall-admin", () => ({
  saveFoodRecallByStaff: vi.fn(),
  getFoodRecallLink: vi.fn().mockResolvedValue({ ok: true, data: { state: "NOT_OFFERED" } }),
  offerFoodRecall: vi.fn(),
}));

const readyIntake = {
  id: "i1",
  state: "ready" as const,
  needsApproval: true,
  kind: "LENGKAP" as const,
  purposeLabel: "Slimming",
  submittedAt: new Date("2026-09-29T02:00:00Z"),
  clinical: { sections: [{ title: "Kesehatan", lines: ["Diabetes: Metformin 500 mg, 2× sehari"] }], activities: null, activityDateLabel: null, habits: null },
};

const approval = {
  state: "ready" as const,
  patientId: "p1",
  patientVersion: "2026-10-01T02:00:00.000Z",
  current: { allergies: "Udang", medicalHistory: null },
  proposed: { allergies: "Amoxicillin", medicalHistory: "Diabetes: Metformin" },
  prefill: { allergies: "Udang\nAmoxicillin", medicalHistory: "Diabetes: Metformin" },
};

const tab = (name: string) => screen.getByRole("tab", { name });

describe("EncounterContextPanel", () => {
  it("peringatan selalu tampil di atas tab", () => {
    renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail()} currentVitals={NO_VITALS} />);
    expect(within(screen.getByRole("region", { name: "Peringatan" })).getByText("Udang")).toBeInTheDocument();
  });

  it("dengan isian: tab Isian kuis terbuka, dengan kepala isian dan kotak persetujuan", () => {
    renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail({ intake: readyIntake, approval })} currentVitals={NO_VITALS} />);
    expect(tab("Isian kuis")).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/Slimming · pasien baru · dikirim Sel, 29 Sep/)).toBeInTheDocument();
    expect(within(panel).getByText("Diabetes: Metformin 500 mg, 2× sehari")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Setujui ke data pasien" })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Buka halaman isian" })).toHaveAttribute("href", "/admin/isian/i1");
  });

  it("tanpa isian tetapi ada riwayat: tab Sebelumnya terbuka dengan kunjungan terbaru lengkap", async () => {
    const history = [
      historyItem(),
      historyItem({ id: "h2", startAt: new Date("2026-09-16T03:00:00Z"), assessment: "Konsultasi awal", assessmentPreview: "Konsultasi awal", plan: "Mulai Program MAX" }),
    ];
    renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail({ history })} currentVitals={NO_VITALS} />);
    expect(tab("Sebelumnya")).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Program MAX, kontrol 1 minggu")).toBeInTheDocument();
    expect(within(panel).getByText(/Meso · Perut · dr\. Diane/)).toBeInTheDocument();
    expect(within(panel).queryByText("Mulai Program MAX")).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /Konsultasi awal/ }));
    expect(within(panel).getByText("Mulai Program MAX")).toBeInTheDocument();
    expect(within(panel).queryByText("Program MAX, kontrol 1 minggu")).not.toBeInTheDocument();
  });

  it("lebih dari 12 kunjungan: tautan ke Data pasien", () => {
    renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail({ history: [historyItem()], hasMoreHistory: true })} currentVitals={NO_VITALS} />);
    expect(within(screen.getByRole("tabpanel")).getByRole("link", { name: "Data pasien" })).toHaveAttribute("href", "/admin/pasien/p1");
  });

  it("tanpa isian dan tanpa riwayat: tab Tren terbuka dengan pesan kosong", () => {
    renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail()} currentVitals={NO_VITALS} />);
    expect(tab("Tren")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Belum ada angka tanda vital.")).toBeInTheDocument();
  });

  it("tab Tren: baris Kunjungan ini memakai angka formulir, dengan selisih dan total", async () => {
    renderAdmin(
      <EncounterContextPanel bia={biaVisit()}
        encounter={encounterDetail({ history: [historyItem()] })}
        currentVitals={{ ...NO_VITALS, weightKg: 72.5, heightCm: 158 }}
      />,
    );
    await userEvent.click(tab("Tren"));
    const table = screen.getByRole("table", { name: "Tren tanda vital" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Kunjungan ini");
    expect(rows[1]).toHaveTextContent("72,5");
    expect(rows[1]).toHaveTextContent("−0,8");
    expect(rows[2]).toHaveTextContent("Rab, 23 Sep");
    expect(rows[2]).toHaveTextContent("130/85");
    expect(screen.getByText(/Total: berat −0,8 kg sejak Rab, 23 Sep/)).toBeInTheDocument();
  });

  it("tab Tren: berat yang belum sah tampil sebagai tanda pisah, bukan NaN", async () => {
    renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail({ history: [historyItem()] })} currentVitals={{ ...NO_VITALS }} />);
    await userEvent.click(tab("Tren"));
    const rows = within(screen.getByRole("table", { name: "Tren tanda vital" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Kunjungan ini");
    expect(rows[1].textContent).not.toMatch(/NaN/);
    expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
  });

  it("suntingan di kotak persetujuan tetap ada setelah pindah tab dan kembali", async () => {
    renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail({ intake: readyIntake, approval })} currentVitals={NO_VITALS} />);
    const allergies = screen.getByLabelText("Alergi");
    await userEvent.clear(allergies);
    await userEvent.type(allergies, "Udang saja");

    await userEvent.click(tab("Tren"));
    await userEvent.click(tab("Isian kuis"));
    expect(screen.getByLabelText("Alergi")).toHaveValue("Udang saja");
  });

  it("kepala tab Isian menyebut apakah isian sudah disetujui ke data pasien", () => {
    const { unmount } = renderAdmin(
      <EncounterContextPanel bia={biaVisit()} encounter={encounterDetail({ intake: readyIntake, approval })} currentVitals={NO_VITALS} />,
    );
    expect(within(screen.getByRole("tabpanel")).getByText(/belum disetujui ke data pasien/)).toBeInTheDocument();
    unmount();

    renderAdmin(
      <EncounterContextPanel bia={biaVisit()}
        encounter={encounterDetail({ intake: { ...readyIntake, needsApproval: false }, approval })}
        currentVitals={NO_VITALS}
      />,
    );
    expect(within(screen.getByRole("tabpanel")).getByText(/sudah disetujui ke data pasien/)).toBeInTheDocument();
  });

  it("peringatan keselamatan: hamil/menyusui, berkas kertas, dan catatan medis yang belum ada", () => {
    const { unmount } = renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail()} currentVitals={NO_VITALS} />);
    const warnings = screen.getByRole("region", { name: "Peringatan" });
    expect(within(warnings).getByText("Hamil, merencanakan kehamilan, atau menyusui (dari isian kunjungan ini)")).toBeInTheDocument();
    expect(within(warnings).getByText("Ada berkas kertas: RM-0457")).toBeInTheDocument();
    unmount();

    renderAdmin(
      <EncounterContextPanel bia={biaVisit()}
        encounter={encounterDetail({ warnings: { allergies: null, medicalHistory: null, importantNotes: null, paperRecordNumber: null, pregnancy: false } })}
        currentVitals={NO_VITALS}
      />,
    );
    expect(screen.getByText("Alergi dan riwayat penyakit belum dicatat.")).toBeInTheDocument();
    expect(screen.queryByText(/Hamil, merencanakan kehamilan/)).not.toBeInTheDocument();
  });

  it("tab Isian: belum diisi, versi kuis tidak dikenal, dan tanpa isian", async () => {
    const { unmount } = renderAdmin(
      <EncounterContextPanel bia={biaVisit()} encounter={encounterDetail({ intake: { id: "i1", state: "pending" } })} currentVitals={NO_VITALS} />,
    );
    expect(within(screen.getByRole("tabpanel")).getByText("Isian belum diisi pasien.")).toBeInTheDocument();
    unmount();

    const second = renderAdmin(
      <EncounterContextPanel bia={biaVisit()}
        encounter={encounterDetail({ intake: { id: "i1", state: "error", message: "Isian dengan kuis versi 9 belum bisa ditampilkan." } })}
        currentVitals={NO_VITALS}
      />,
    );
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/Isian dengan kuis versi 9 belum bisa ditampilkan\./)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Buka halaman isian" })).toHaveAttribute("href", "/admin/isian/i1");
    second.unmount();

    renderAdmin(<EncounterContextPanel bia={biaVisit()} encounter={encounterDetail()} currentVitals={NO_VITALS} />);
    await userEvent.click(tab("Isian kuis"));
    expect(within(screen.getByRole("tabpanel")).getByText("Tidak ada isian kuis untuk kunjungan ini.")).toBeInTheDocument();
  });

  it("tab BIA ada di antara Food recall dan Sebelumnya, dan isinya tab BIA", async () => {
    renderAdmin(<EncounterContextPanel encounter={encounterDetail()} currentVitals={encounterDetail().vitals} bia={biaVisit()} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Isian kuis", "Food recall", "BIA", "Sebelumnya", "Tren"]);
    await userEvent.click(screen.getByRole("tab", { name: "BIA" }));
    expect(screen.getByRole("tabpanel", { name: "BIA" })).toHaveTextContent("Belum ada hasil BIA untuk kunjungan ini.");
  });
});

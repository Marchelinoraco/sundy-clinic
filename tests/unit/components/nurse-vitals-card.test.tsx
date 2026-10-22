import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NurseVitalsCard } from "@/components/admin/nurse/nurse-vitals-card";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { completeNurseVisit, saveNurseVitals } from "@/server/nurse-vitals";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/nurse-vitals", () => ({ saveNurseVitals: vi.fn(), completeNurseVisit: vi.fn() }));

const EMPTY = { systolic: "", diastolic: "", pulse: "", temperatureC: "", weightKg: "", heightCm: "", waistCm: "" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveNurseVitals).mockResolvedValue({ ok: true, data: { version: "v1", savedAt: "2026-10-23T01:15:00.000Z" } });
  vi.mocked(completeNurseVisit).mockResolvedValue({ ok: true, data: undefined });
});

describe("NurseVitalsCard (spec vital perawat VP1–VP3, VP6)", () => {
  it("isian sama dengan bagian O dokter, tinggi badan terisi, dan tersimpan otomatis dengan versinya", async () => {
    const user = userEvent.setup();
    renderAdmin(<NurseVitalsCard appointmentId="a1" vitals={{ inputs: { ...EMPTY, heightCm: "160" }, version: null, completed: null }} autosaveDelayMs={10} />);
    for (const label of ["Sistolik (mmHg)", "Diastolik (mmHg)", "Nadi (/menit)", "Suhu (°C)", "Berat badan (kg)", "Tinggi badan (cm)", "Lingkar pinggang/perut (cm)"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Tinggi badan (cm)")).toHaveValue("160");
    await user.type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    // Simpan pertama tanpa versi; simpan berikutnya memakai versi dari server; nilai terakhir yang menang.
    await waitFor(() => expect(vi.mocked(saveNurseVitals).mock.lastCall?.[0].vitals).toEqual({ ...EMPTY, heightCm: "160", weightKg: "72,5" }));
    expect(vi.mocked(saveNurseVitals).mock.calls[0][0]).toMatchObject({ appointmentId: "a1", version: "" });
  });

  it("Selesai ditangani meminta konfirmasi, lalu menyelesaikan dan memuat ulang", async () => {
    const user = userEvent.setup();
    renderAdmin(<NurseVitalsCard appointmentId="a1" vitals={{ inputs: EMPTY, version: "v0", completed: null }} autosaveDelayMs={10} />);
    await user.click(screen.getByRole("button", { name: "Selesai ditangani" }));
    const dialog = await screen.findByRole("dialog", { name: "Selesaikan penanganan?" });
    expect(dialog).toHaveTextContent("Angka vital tidak bisa diubah lagi di halaman ini.");
    await user.click(within(dialog).getByRole("button", { name: "Selesai ditangani" }));
    await waitFor(() => expect(completeNurseVisit).toHaveBeenCalledWith({ appointmentId: "a1" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("sudah selesai: angka hanya dibaca, dengan nama perawat dan jamnya", () => {
    renderAdmin(
      <NurseVitalsCard
        appointmentId="a1"
        vitals={{ inputs: { ...EMPTY, weightKg: "72,5" }, version: "v2", completed: { byName: "Rina", at: combineWitaDateAndMinutes("2026-10-23", 9 * 60 + 15) } }}
      />,
    );
    expect(screen.getByText("Ditangani Rina · 09.15")).toBeInTheDocument();
    expect(screen.getByText("Berat badan: 72,5 kg")).toBeInTheDocument();
    expect(screen.queryByLabelText("Berat badan (kg)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Selesai ditangani" })).toBeNull();
  });
});

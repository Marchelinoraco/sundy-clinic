import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DoctorWorklistView } from "@/components/admin/doctor-worklist";
import { openEncounter } from "@/server/encounter";
import type { WorklistRow } from "@/server/encounter-read";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/encounter", () => ({ openEncounter: vi.fn() }));

const row = (patch: Partial<WorklistRow>): WorklistRow => ({
  appointmentId: "a1",
  code: "SDY-8F3K",
  startAt: new Date("2026-10-01T07:00:00Z"),
  patientName: "Siti Rahayu",
  patientRecordNumber: "SDY-2026-0001",
  serviceName: "Konsultasi Dokter",
  branchName: "SunDY Mahakeret",
  encounterId: null,
  state: "BELUM",
  foodRecallFilled: false,
  ...patch,
});

describe("DoctorWorklistView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pasien hari ini: Periksa, Lanjutkan, atau Lihat sesuai status kunjungan", () => {
    render(
      <DoctorWorklistView
        worklist={{
          today: [
            row({}),
            row({ appointmentId: "a2", patientName: "Budi", state: "DRAF", encounterId: "e2" }),
            row({ appointmentId: "a3", patientName: "Rina", state: "FINAL", encounterId: "e3" }),
          ],
          unfinished: [],
        }}
      />,
    );
    const today = screen.getByRole("region", { name: "Pasien hari ini" });
    const rows = within(today).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("15.00");
    expect(rows[1]).toHaveTextContent("Belum diperiksa");
    expect(within(rows[1]).getByRole("button", { name: "Periksa" })).toBeInTheDocument();
    expect(within(rows[2]).getByRole("link", { name: "Lanjutkan" })).toHaveAttribute("href", "/admin/kunjungan/e2");
    expect(within(rows[3]).getByRole("link", { name: "Lihat" })).toHaveAttribute("href", "/admin/kunjungan/e3");
    expect(screen.getByText("Tidak ada catatan yang tertinggal.")).toBeInTheDocument();
  });

  it("catatan belum final menampilkan tanggalnya", () => {
    render(
      <DoctorWorklistView
        worklist={{ today: [], unfinished: [row({ startAt: new Date("2026-09-28T07:00:00Z"), state: "DRAF", encounterId: "e9" })] }}
      />,
    );
    expect(screen.getByText("Belum ada pasien yang ditandai hadir hari ini.")).toBeInTheDocument();
    const unfinished = screen.getByRole("region", { name: "Catatan belum final" });
    expect(within(unfinished).getByText(/28 Sep/)).toBeInTheDocument();
    expect(within(unfinished).getByRole("link", { name: "Lanjutkan" })).toHaveAttribute("href", "/admin/kunjungan/e9");
  });

  it("Periksa membuka kunjungan lalu pindah ke halamannya; galat ditampilkan", async () => {
    vi.mocked(openEncounter).mockResolvedValueOnce({ ok: true, data: { encounterId: "e1" } });
    render(<DoctorWorklistView worklist={{ today: [row({})], unfinished: [] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Periksa" }));
    expect(openEncounter).toHaveBeenCalledWith("a1");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kunjungan/e1"));

    vi.mocked(openEncounter).mockResolvedValueOnce({ ok: false, error: "Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir." });
    await userEvent.click(screen.getByRole("button", { name: "Periksa" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir."),
    );
  });

  it("menandai customer yang sudah mengisi food recall", () => {
    render(<DoctorWorklistView worklist={{ today: [row({ foodRecallFilled: true })], unfinished: [] }} />);
    expect(screen.getByText("food recall ✓")).toBeInTheDocument();
  });
});

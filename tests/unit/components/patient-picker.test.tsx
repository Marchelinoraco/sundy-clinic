import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PatientPicker } from "@/components/admin/patient-picker";
import { searchPatients, type PatientSummary } from "@/server/patient";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/patient", () => ({
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  findPatientsByWhatsapp: vi.fn(),
}));

const patient = (patch: Partial<PatientSummary>): PatientSummary => ({
  id: "p1",
  medicalRecordNumber: "SDY-2026-0012",
  name: "Maria Wenas",
  whatsapp: "6281234567001",
  programStatus: "AKTIF",
  lastVisitAt: null,
  nextBookingAt: null,
  ...patch,
});

describe("PatientPicker", () => {
  it("hasil pencarian menampilkan kunjungan terakhir dan booking berikutnya", async () => {
    vi.mocked(searchPatients).mockResolvedValue([
      patient({ lastVisitAt: new Date("2026-09-24T03:00:00Z"), nextBookingAt: new Date("2026-10-07T03:30:00Z") }),
      patient({ id: "p2", name: "Maria Baru", medicalRecordNumber: "SDY-2026-0013" }),
    ]);
    const user = userEvent.setup();
    renderAdmin(<PatientPicker onSelect={vi.fn()} />);

    await user.type(screen.getByLabelText(/Cari pasien/), "maria");

    const known = await screen.findByRole("option", { name: /Maria Wenas/ });
    expect(known).toHaveTextContent("Kunjungan terakhir Kam, 24 Sep");
    expect(known).toHaveTextContent("booking berikutnya Rab, 7 Okt 11.30");
    const fresh = screen.getByRole("option", { name: /Maria Baru/ });
    expect(fresh).toHaveTextContent("Kunjungan terakhir belum pernah");
    expect(fresh).not.toHaveTextContent("booking berikutnya");
  });

  it("memilih opsi memanggil onSelect dengan pasien itu", async () => {
    const maria = patient({});
    vi.mocked(searchPatients).mockResolvedValue([maria]);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderAdmin(<PatientPicker onSelect={onSelect} />);
    await user.type(screen.getByRole("combobox", { name: /Cari pasien/ }), "maria");
    await user.click(await screen.findByRole("option", { name: /Maria Wenas/ }));
    expect(onSelect).toHaveBeenCalledWith(maria);
  });

  it("tanpa hasil atau galat jaringan → 'Tidak ada pasien yang cocok.'", async () => {
    vi.mocked(searchPatients).mockRejectedValue(new Error("jaringan"));
    const user = userEvent.setup();
    renderAdmin(<PatientPicker onSelect={vi.fn()} />);
    await user.type(screen.getByRole("combobox", { name: /Cari pasien/ }), "zzz");
    expect(await screen.findByText("Tidak ada pasien yang cocok.")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineAppointmentForm } from "@/components/admin/online-appointment-form";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { getTransferInstruction } from "@/server/appointment";
import { createOnlineAppointment } from "@/server/online-consultation";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({ getTransferInstruction: vi.fn() }));
vi.mock("@/server/online-consultation", () => ({ createOnlineAppointment: vi.fn() }));
vi.mock("@/server/appointment-message", () => ({ recordAppointmentMessage: vi.fn() }));
vi.mock("@/server/patient", () => ({ searchPatients: vi.fn(), createPatient: vi.fn() }));

const patient = {
  id: "p1",
  name: "Siti Rahayu",
  medicalRecordNumber: "SDY-2026-0001",
  whatsapp: "6281234567890",
} as never;

const today = witaDateString(new Date());
const inThreeDays = addDaysToDateString(today, 3);

function renderForm() {
  return render(
    <OnlineAppointmentForm
      doctors={[{ id: "d1", name: "dr. Diane" }]}
      today={today}
      maxDate={addDaysToDateString(today, 14)}
      bookingFee={100000}
      servicePrice={250000}
      initialPatient={patient}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("OnlineAppointmentForm", () => {
  it("ringkasan memuat total transfer: biaya booking + harga konsultasi", () => {
    renderForm();
    const summary = screen.getByRole("complementary", { name: "Ringkasan booking" });
    expect(summary).toHaveTextContent("Rp 100.000");
    expect(summary).toHaveTextContent("Rp 250.000");
    expect(summary).toHaveTextContent("Rp 350.000");
  });

  it("membuat booking online lalu menampilkan panel instruksi transfer", async () => {
    const user = userEvent.setup();
    const startAt = combineWitaDateAndMinutes(inThreeDays, 19 * 60);
    vi.mocked(createOnlineAppointment).mockResolvedValue({ ok: true, data: { id: "a9", code: "SDY-ON09", startAt } as never });
    vi.mocked(getTransferInstruction).mockResolvedValue({
      ok: true,
      data: { text: "Halo Siti…", link: "https://wa.me/6281234567890?text=x", missingBankAccount: false } as never,
    });
    renderForm();

    fireEvent.change(screen.getByLabelText("Tanggal waktu 1"), { target: { value: inThreeDays } });
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));

    await waitFor(() =>
      expect(createOnlineAppointment).toHaveBeenCalledWith({
        patientId: "p1",
        staffId: "d1",
        source: "WHATSAPP",
        windows: [{ date: inThreeDays, startMinute: 1140, endMinute: 1260 }],
        notes: undefined,
      }),
    );
    expect(await screen.findByText("✓ Booking SDY-ON09 dibuat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kirim instruksi transfer via WA/ })).toBeInTheDocument();
  });

  it("tanggal kosong ditolak di browser tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    expect(createOnlineAppointment).not.toHaveBeenCalled();
  });
});

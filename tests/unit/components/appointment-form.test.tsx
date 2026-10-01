import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { AppointmentForm } from "@/components/admin/appointment-form";
import { addDaysToDateString, combineWitaDateAndMinutes } from "@/lib/time";
import { createAppointment, getTransferInstruction } from "@/server/appointment";
import { searchPatients, type PatientSummary } from "@/server/patient";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange, type DayAvailability } from "@/server/schedule";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({ createAppointment: vi.fn(), getTransferInstruction: vi.fn() }));
vi.mock("@/server/patient", () => ({
  searchPatients: vi.fn(),
  createPatient: vi.fn(),
  findPatientsByWhatsapp: vi.fn(),
}));
vi.mock("@/server/schedule", () => ({
  getStaffAvailabilityRange: vi.fn(),
  getStaffAvailabilityForAdmin: vi.fn(),
}));

const TODAY = "2026-10-05"; // Senin
const START = combineWitaDateAndMinutes(TODAY, 11 * 60);
const SLOT = { startAt: START, endAt: combineWitaDateAndMinutes(TODAY, 11 * 60 + 30), label: "11.00" };
const MARIA: PatientSummary = {
  id: "p1",
  medicalRecordNumber: "SDY-2026-0012",
  name: "Maria Wenas",
  whatsapp: "6281234567001",
  programStatus: "AKTIF",
  lastVisitAt: null,
  nextBookingAt: null,
};

function renderForm() {
  return render(
    <AppointmentForm
      branches={[{ id: "b1", name: "SunDY Mahakeret" }]}
      staff={[{ id: "d1", name: "dr. Diane", role: "DOKTER" }]}
      treatmentGroups={[]}
      consultationServiceId="svc-konsultasi"
      today={TODAY}
      bookingFee={100000}
    />,
  );
}

const summary = () => screen.getByRole("complementary", { name: "Ringkasan booking" });

async function fillBooking(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Cari pasien/), "maria");
  await user.click(await screen.findByRole("button", { name: /Maria Wenas/ }));
  await user.click(await screen.findByRole("button", { name: "Senin, 5 Oktober 2026 — 2 jam kosong" }));
  await user.click(await screen.findByRole("button", { name: "11.00" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchPatients).mockResolvedValue([MARIA]);
  vi.mocked(getStaffAvailabilityRange).mockResolvedValue(
    Array.from({ length: 14 }, (_, index): DayAvailability => ({
      date: addDaysToDateString(TODAY, index),
      state: index === 0 ? "OPEN" : "CLOSED",
      openCount: index === 0 ? 2 : 0,
    })),
  );
  vi.mocked(getStaffAvailabilityForAdmin).mockResolvedValue([SLOT]);
  vi.mocked(createAppointment).mockResolvedValue({ ok: true, data: { id: "a1", code: "SDY-7KQ2", startAt: START } as never });
  vi.mocked(getTransferInstruction).mockResolvedValue({
    ok: true,
    data: {
      text: "Halo Maria",
      link: "https://wa.me/6281234567001?text=Halo%20Maria",
      deadline: START,
      missingBankAccount: false,
    },
  });
});

describe("AppointmentForm", () => {
  it("WhatsApp terpilih di awal, dan strip tampil karena dokter satu-satunya langsung terpilih", async () => {
    renderForm();
    expect(screen.getByRole("button", { name: "WhatsApp" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("group", { name: "Pilih tanggal" })).toBeInTheDocument();
    expect(getStaffAvailabilityRange).toHaveBeenCalledWith({
      staffId: "d1",
      branchId: "b1",
      durationMinutes: 30,
      from: TODAY,
      days: 14,
    });
    expect(screen.getByText("Pilih tanggal dulu.")).toBeInTheDocument();
  });

  it("ringkasan terisi bertahap, lalu Buat Booking menampilkan panel dengan instruksi transfer", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(summary()).toHaveTextContent("Pasienbelum dipilih");

    await fillBooking(user);
    expect(summary()).toHaveTextContent("PasienMaria Wenas");
    expect(summary()).toHaveTextContent("JadwalSen, 5 Okt · 11.00");

    await user.click(screen.getByRole("button", { name: "Buat Booking" }));

    expect(await screen.findByRole("heading", { name: "✓ Booking SDY-7KQ2 dibuat" })).toBeInTheDocument();
    expect(createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: "p1",
        staffId: "d1",
        branchId: "b1",
        serviceId: "svc-konsultasi",
        type: "KONSULTASI",
        source: "WHATSAPP",
        startAt: START,
      }),
    );
    expect(getTransferInstruction).toHaveBeenCalledWith("a1");
    expect(screen.getByRole("link", { name: "Kirim instruksi transfer via WA" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567001?text=Halo%20Maria",
    );
    expect(screen.getByRole("link", { name: /Lihat di daftar/ })).toHaveAttribute(
      "href",
      "/admin/booking?tanggal=2026-10-05&sorot=a1",
    );
  });

  it("setelah dibuat formulir terkunci sampai + Booking baru, yang mempertahankan sumber terakhir", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Telepon" }));
    await fillBooking(user);
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    await screen.findByRole("heading", { name: "✓ Booking SDY-7KQ2 dibuat" });

    expect(screen.queryByRole("button", { name: "Buat Booking" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telepon" })).toBeDisabled();
    // Select Radix terbuka lewat pointerdown, yang tetap sampai walau fieldset-nya disabled:
    // ia harus dikunci lewat prop disabled-nya sendiri, yang memasang data-disabled.
    expect(screen.getByRole("combobox", { name: "Tenaga" })).toHaveAttribute("data-disabled");

    await user.click(screen.getByRole("button", { name: "+ Booking baru" }));

    expect(screen.queryByRole("heading", { name: /Booking SDY-7KQ2 dibuat/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telepon" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Telepon" })).toBeEnabled();
    expect(screen.getByLabelText(/Cari pasien/)).toHaveValue("");
    expect(summary()).toHaveTextContent("Jadwalbelum dipilih");
    expect(screen.getByRole("button", { name: "Buat Booking" })).toBeEnabled();
  });

  it("jam direbut booking lain: pesan galat, jam dikosongkan, tanggal tetap, strip dan jam dimuat ulang", async () => {
    vi.mocked(createAppointment).mockResolvedValue({ ok: false, error: "Slot baru saja terisi. Pilih jam lain." });
    const user = userEvent.setup();
    renderForm();
    await fillBooking(user);

    await user.click(screen.getByRole("button", { name: "Buat Booking" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Slot baru saja terisi. Pilih jam lain."));
    await waitFor(() => expect(getStaffAvailabilityRange).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStaffAvailabilityForAdmin).toHaveBeenCalledTimes(2));
    expect(summary()).toHaveTextContent("Jadwalbelum dipilih");
    expect(await screen.findByRole("button", { name: "Senin, 5 Oktober 2026 — 2 jam kosong" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(getTransferInstruction).not.toHaveBeenCalled();
  });

  it("Buat Booking tanpa pasien menyebutkan apa yang kurang", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    expect(toast.error).toHaveBeenCalledWith("Pilih atau buat pasien terlebih dahulu.");
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("booking tersimpan walau instruksi transfer gagal dimuat", async () => {
    vi.mocked(getTransferInstruction).mockRejectedValue(new Error("jaringan"));
    const user = userEvent.setup();
    renderForm();
    await fillBooking(user);
    await user.click(screen.getByRole("button", { name: "Buat Booking" }));
    expect(await screen.findByRole("heading", { name: "✓ Booking SDY-7KQ2 dibuat" })).toBeInTheDocument();
    expect(screen.getByText(/Instruksi transfer gagal dimuat/)).toBeInTheDocument();
  });
});

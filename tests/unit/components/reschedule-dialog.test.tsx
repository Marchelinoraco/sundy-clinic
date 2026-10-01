import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { RescheduleDialog } from "@/components/admin/reschedule-dialog";
import type { RescheduleTarget } from "@/lib/booking-actions";
import { addDaysToDateString, combineWitaDateAndMinutes } from "@/lib/time";
import { rescheduleAppointment } from "@/server/appointment";
import { getBookingMessage } from "@/server/appointment-message";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange, type DayAvailability } from "@/server/schedule";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({ rescheduleAppointment: vi.fn() }));
vi.mock("@/server/appointment-message", () => ({ getBookingMessage: vi.fn(), recordAppointmentMessage: vi.fn() }));
vi.mock("@/server/schedule", () => ({
  getStaffAvailabilityRange: vi.fn(),
  getStaffAvailabilityForAdmin: vi.fn(),
}));

const TODAY = "2026-10-05"; // Senin
const TARGET: RescheduleTarget = {
  appointmentId: "a1",
  code: "SDY-7KQ2",
  patientName: "Maria Wenas",
  startAt: combineWitaDateAndMinutes(TODAY, 11 * 60),
  durationMinutes: 30,
  staffId: "d1",
  staffName: "dr. Diane",
  branchId: "b1",
  branchName: "SunDY Mahakeret",
};
const NEW_START = combineWitaDateAndMinutes("2026-10-06", 13 * 60);
const SLOT = { startAt: NEW_START, endAt: combineWitaDateAndMinutes("2026-10-06", 13 * 60 + 30), label: "13.00" };
const TUESDAY = "Selasa, 6 Oktober 2026 — 2 jam kosong";

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<RescheduleDialog target={TARGET} today={TODAY} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

async function pickNewSlot(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: TUESDAY }));
  await user.click(await screen.findByRole("button", { name: "13.00" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStaffAvailabilityRange).mockResolvedValue(
    Array.from({ length: 14 }, (_, index): DayAvailability => ({
      date: addDaysToDateString(TODAY, index),
      state: index === 1 ? "OPEN" : "CLOSED",
      openCount: index === 1 ? 2 : 0,
    })),
  );
  vi.mocked(getStaffAvailabilityForAdmin).mockResolvedValue([SLOT]);
  vi.mocked(rescheduleAppointment).mockResolvedValue({ ok: true, data: {} as never });
  vi.mocked(getBookingMessage).mockResolvedValue({
    ok: true,
    data: { kind: "KONFIRMASI", text: "Halo Maria", link: "https://wa.me/6281234567001?text=Halo", scheduledFor: NEW_START },
  });
});

describe("RescheduleDialog", () => {
  it("menampilkan jadwal saat ini dan memuat ketersediaan tanpa menghitung booking ini", async () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Pindah jadwal — SDY-7KQ2" })).toHaveTextContent(
      "Maria Wenas · sekarang Sen, 5 Okt 11.00 · dr. Diane · SunDY Mahakeret",
    );
    expect(screen.getByText(/Untuk ganti tenaga atau cabang, batalkan lalu buat booking baru/)).toBeInTheDocument();
    await screen.findByRole("group", { name: "Pilih tanggal" });
    expect(getStaffAvailabilityRange).toHaveBeenCalledWith({
      staffId: "d1",
      branchId: "b1",
      durationMinutes: 30,
      from: TODAY,
      days: 14,
      excludeAppointmentId: "a1",
    });
  });

  it("menyimpan jam baru lalu menawarkan konfirmasi jadwal baru", async () => {
    const user = userEvent.setup();
    renderDialog();
    await pickNewSlot(user);
    expect(getStaffAvailabilityForAdmin).toHaveBeenCalledWith({
      staffId: "d1",
      branchId: "b1",
      date: "2026-10-06",
      durationMinutes: 30,
      excludeAppointmentId: "a1",
    });

    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));

    expect(await screen.findByRole("heading", { name: "Jadwal dipindah" })).toBeInTheDocument();
    expect(rescheduleAppointment).toHaveBeenCalledWith("a1", { startAt: SLOT.startAt, endAt: SLOT.endAt });
    expect(screen.getByText(/jadwal baru Sel, 6 Okt 13.00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kirim konfirmasi jadwal baru via WA" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567001?text=Halo",
    );
  });

  it("booking yang belum transfer: tombol instruksi transfer", async () => {
    vi.mocked(getBookingMessage).mockResolvedValue({
      ok: true,
      data: {
        kind: "INSTRUKSI_TRANSFER",
        text: "Mohon transfer",
        link: "https://wa.me/6281234567001?text=T",
        scheduledFor: NEW_START,
      },
    });
    const user = userEvent.setup();
    renderDialog();
    await pickNewSlot(user);
    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));
    expect(await screen.findByRole("link", { name: "Kirim instruksi transfer" })).toBeInTheDocument();
  });

  it("tanpa pesan lanjutan: hanya Tutup", async () => {
    vi.mocked(getBookingMessage).mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    const onOpenChange = renderDialog();
    await pickNewSlot(user);
    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));
    await screen.findByRole("heading", { name: "Jadwal dipindah" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tutup" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("jam direbut booking lain: pesan galat, tanggal tetap, strip dan jam dimuat ulang", async () => {
    vi.mocked(rescheduleAppointment).mockResolvedValue({ ok: false, error: "Slot baru saja terisi. Pilih jam lain." });
    const user = userEvent.setup();
    renderDialog();
    await pickNewSlot(user);
    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Slot baru saja terisi. Pilih jam lain."));
    await waitFor(() => expect(getStaffAvailabilityRange).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getStaffAvailabilityForAdmin).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: TUESDAY })).toHaveAttribute("aria-pressed", "true");
    expect(getBookingMessage).not.toHaveBeenCalled();
  });

  it("Simpan tanpa memilih jam: diminta memilih dulu", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Simpan jadwal baru" }));
    expect(toast.error).toHaveBeenCalledWith("Pilih tanggal dan jam baru.");
    expect(rescheduleAppointment).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookingCreatedPanel, type CreatedBooking } from "@/components/admin/booking-created-panel";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEXT = "Halo Maria Wenas, booking Anda di SunDY Clinic sudah kami catat.\nKode: SDY-7KQ2";
const created: CreatedBooking = {
  id: "a1",
  code: "SDY-7KQ2",
  date: "2026-10-05",
  instruction: {
    text: TEXT,
    link: `https://wa.me/6281234567001?text=${encodeURIComponent(TEXT)}`,
    deadline: new Date("2026-10-05T03:00:00Z"),
    missingBankAccount: false,
  },
  instructionFailed: false,
};

function renderPanel(booking: CreatedBooking) {
  const onNew = vi.fn();
  render(<BookingCreatedPanel booking={booking} dateLabel="Sen, 5 Okt" onNew={onNew} />);
  return onNew;
}

describe("BookingCreatedPanel", () => {
  it("tautan WA ke nomor pasien dengan kode booking di teksnya, dan Lihat di daftar menyorot booking itu", () => {
    renderPanel(created);
    expect(screen.getByRole("heading", { name: "✓ Booking SDY-7KQ2 dibuat" })).toBeInTheDocument();
    const wa = screen.getByRole("link", { name: "Kirim instruksi transfer via WA" });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/6281234567001\?text=/);
    expect(decodeURIComponent(wa.getAttribute("href")!)).toContain("Kode: SDY-7KQ2");
    expect(screen.getByRole("link", { name: "Lihat di daftar (Sen, 5 Okt)" })).toHaveAttribute(
      "href",
      "/admin/booking?tanggal=2026-10-05&sorot=a1",
    );
  });

  it("Salin teks menyalin instruksi yang sama", async () => {
    const user = userEvent.setup();
    renderPanel(created);
    await user.click(screen.getByRole("button", { name: "Salin teks" }));
    expect(await navigator.clipboard.readText()).toBe(TEXT);
  });

  it("walk-in atau tanpa biaya: tanpa instruksi transfer, tetap ada Lihat di daftar dan + Booking baru", async () => {
    const user = userEvent.setup();
    const onNew = renderPanel({ ...created, instruction: null });
    expect(screen.queryByRole("link", { name: /Kirim instruksi transfer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salin teks" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lihat di daftar/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Booking baru" }));
    expect(onNew).toHaveBeenCalled();
  });

  it("rekening kosong di Pengaturan: peringatan", () => {
    renderPanel({ ...created, instruction: { ...created.instruction!, missingBankAccount: true } });
    expect(screen.getByText(/Rekening belum diisi di Pengaturan/)).toBeInTheDocument();
  });

  it("nomor WA pasien tidak sah: hanya Salin teks, dengan keterangan", () => {
    renderPanel({ ...created, instruction: { ...created.instruction!, link: null } });
    expect(screen.queryByRole("link", { name: /Kirim instruksi transfer/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nomor WhatsApp pasien tidak dikenali.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salin teks" })).toBeInTheDocument();
  });

  it("instruksi gagal dimuat: arahkan ke daftar", () => {
    renderPanel({ ...created, instruction: null, instructionFailed: true });
    expect(screen.getByText(/Instruksi transfer gagal dimuat/)).toBeInTheDocument();
  });
});

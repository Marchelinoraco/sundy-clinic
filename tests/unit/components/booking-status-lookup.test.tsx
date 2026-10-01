import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingStatusLookup } from "@/components/pendaftaran/booking-status-lookup";

const actions = vi.hoisted(() => ({ findBookingStatus: vi.fn(), cancelSiteBooking: vi.fn() }));
vi.mock("@/server/public-booking", () => actions);

const confirmed = {
  code: "SDY-8F3K",
  status: "TERKONFIRMASI",
  statusLabel: "Terkonfirmasi",
  serviceName: "Konsultasi Dokter",
  staffName: "Dr. Diane",
  branchName: "SunDY Mahakeret",
  startAt: new Date("2026-10-01T07:00:00Z"),
  maskedWhatsapp: "0812-****-7890",
  bookingFee: 100000,
  canCancel: true,
  canReschedule: true,
  rescheduleLink: "https://wa.me/6285172228900?text=pindah",
};

afterEach(() => vi.clearAllMocks());

async function lookUp() {
  await userEvent.type(screen.getByLabelText("Kode booking"), "sdy-8f3k");
  await userEvent.type(screen.getByLabelText("4 digit terakhir nomor WhatsApp"), "7890");
  await userEvent.click(screen.getByRole("button", { name: "Cek Status" }));
}

describe("BookingStatusLookup", () => {
  it("kode dari tautan konfirmasi sudah terisi; customer cukup mengetik 4 digit", () => {
    render(<BookingStatusLookup initialCode="SDY-8F3K" />);
    expect(screen.getByLabelText("Kode booking")).toHaveValue("SDY-8F3K");
    expect(screen.getByLabelText("4 digit terakhir nomor WhatsApp")).toHaveValue("");
  });

  it("menampilkan status, jadwal, dan tawaran pindah jadwal", async () => {
    actions.findBookingStatus.mockResolvedValue({ ok: true, data: confirmed });
    render(<BookingStatusLookup />);
    await lookUp();

    expect(await screen.findByText("Terkonfirmasi")).toBeInTheDocument();
    expect(screen.getByText("0812-****-7890")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pindah jadwal via WhatsApp" })).toHaveAttribute(
      "href",
      confirmed.rescheduleLink,
    );
    expect(actions.findBookingStatus).toHaveBeenCalledWith({ code: "sdy-8f3k", last4: "7890" });
  });

  it("memberi tahu bila booking tidak ditemukan", async () => {
    actions.findBookingStatus.mockResolvedValue({ ok: true, data: null });
    render(<BookingStatusLookup />);
    await lookUp();
    expect(await screen.findByText(/Booking tidak ditemukan/)).toBeInTheDocument();
  });

  it("memperingatkan bahwa biaya booking tidak dikembalikan sebelum membatalkan", async () => {
    actions.findBookingStatus.mockResolvedValue({ ok: true, data: confirmed });
    actions.cancelSiteBooking.mockResolvedValue({
      ok: true,
      data: { ...confirmed, status: "DIBATALKAN", statusLabel: "Dibatalkan", canCancel: false, canReschedule: false, rescheduleLink: null },
    });
    render(<BookingStatusLookup />);
    await lookUp();

    await userEvent.click(await screen.findByRole("button", { name: "Batalkan booking" }));
    expect(screen.getByText(/Biaya booking Rp 100.000 tidak dikembalikan/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ya, batalkan" }));

    expect(await screen.findByText("Dibatalkan")).toBeInTheDocument();
    expect(actions.cancelSiteBooking).toHaveBeenCalledWith({ code: "SDY-8F3K", last4: "7890" });
  });
  it("membatalkan dengan 4 digit yang dipakai saat pencarian, bukan isi kolom yang sudah diubah", async () => {
    actions.findBookingStatus.mockResolvedValue({ ok: true, data: confirmed });
    actions.cancelSiteBooking.mockResolvedValue({
      ok: true,
      data: { ...confirmed, status: "DIBATALKAN", statusLabel: "Dibatalkan", canCancel: false, canReschedule: false, rescheduleLink: null },
    });
    render(<BookingStatusLookup />);
    await lookUp();
    await screen.findByText("Terkonfirmasi");

    const digits = screen.getByLabelText("4 digit terakhir nomor WhatsApp");
    await userEvent.clear(digits);
    await userEvent.type(digits, "1111");
    await userEvent.click(screen.getByRole("button", { name: "Batalkan booking" }));
    await userEvent.click(screen.getByRole("button", { name: "Ya, batalkan" }));

    await screen.findByText("Dibatalkan");
    expect(actions.cancelSiteBooking).toHaveBeenCalledWith({ code: "SDY-8F3K", last4: "7890" });
  });

  it("booking yang belum dibayar: pesan pembatalan tidak menyebut 'pasien'", async () => {
    actions.findBookingStatus.mockResolvedValue({
      ok: true,
      data: { ...confirmed, status: "MENUNGGU_KONFIRMASI", statusLabel: "Menunggu konfirmasi" },
    });
    render(<BookingStatusLookup />);
    await lookUp();
    await userEvent.click(await screen.findByRole("button", { name: "Batalkan booking" }));
    expect(screen.getByText("Jam Anda akan dilepas agar bisa dipesan orang lain.")).toBeInTheDocument();
  });
});

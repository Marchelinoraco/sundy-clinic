import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendMessageDialog } from "@/components/admin/send-message-dialog";
import type { BookingMessage } from "@/lib/booking-messages";
import { recordAppointmentMessage } from "@/server/appointment-message";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment-message", () => ({ recordAppointmentMessage: vi.fn() }));

const MESSAGE: BookingMessage = {
  kind: "KONFIRMASI",
  text: "Halo Maria, booking Anda sudah terkonfirmasi.",
  link: "https://wa.me/6281234567001?text=Halo",
};

function renderDialog(message: BookingMessage | null = MESSAGE) {
  const onOpenChange = vi.fn();
  render(
    <SendMessageDialog
      open
      onOpenChange={onOpenChange}
      title="✓ Booking SDY-7KQ2 terkonfirmasi"
      description="Maria Wenas · Sen, 5 Okt 11.00"
      appointmentId="a1"
      message={message}
      sendLabel="Kirim konfirmasi via WA"
      laterNote="Booking ini tetap tercatat di Pengingat → Konfirmasi belum dikirim."
    />,
  );
  return onOpenChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m1" } });
});

describe("SendMessageDialog", () => {
  it("tombol WA mencatat konfirmasi lalu menutup dialog", async () => {
    const onOpenChange = renderDialog();
    expect(screen.getByRole("dialog", { name: "✓ Booking SDY-7KQ2 terkonfirmasi" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Kirim konfirmasi via WA" });
    link.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(link);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "a1", kind: "KONFIRMASI" });
  });

  it("Salin teks menyalin pesan tanpa mencatatnya sebagai terkirim", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Salin teks" }));
    expect(await navigator.clipboard.readText()).toBe(MESSAGE.text);
    expect(recordAppointmentMessage).not.toHaveBeenCalled();
  });

  it("nomor tidak sah: tanpa tombol WA, Salin teks tetap ada", () => {
    renderDialog({ ...MESSAGE, link: null });
    expect(screen.queryByRole("link", { name: /Kirim/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nomor WhatsApp pasien tidak dikenali.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salin teks" })).toBeInTheDocument();
  });

  it("Nanti saja menutup dialog dan menjelaskan ke mana booking ini pergi", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderDialog();
    expect(screen.getByText("Booking ini tetap tercatat di Pengingat → Konfirmasi belum dikirim.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nanti saja" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

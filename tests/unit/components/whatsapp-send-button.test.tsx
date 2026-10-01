import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { WhatsAppSendButton } from "@/components/admin/whatsapp-send-button";
import { recordAppointmentMessage } from "@/server/appointment-message";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment-message", () => ({ recordAppointmentMessage: vi.fn() }));

const SHOWN = new Date("2026-10-05T03:00:00Z");

function renderButton(onRecorded = vi.fn()) {
  render(
    <WhatsAppSendButton href="https://wa.me/6281234567001?text=Halo" appointmentId="a1" kind="PENGINGAT" scheduledFor={SHOWN} onRecorded={onRecorded}>
      Ingatkan via WA
    </WhatsAppSendButton>,
  );
  const link = screen.getByRole("link", { name: "Ingatkan via WA" });
  // jsdom tidak bernavigasi; cegah percobaan navigasinya.
  link.addEventListener("click", (event) => event.preventDefault());
  return { link, onRecorded };
}

beforeEach(() => vi.clearAllMocks());

describe("WhatsAppSendButton", () => {
  it("membuka WA di tab baru dan mencatat pengiriman", async () => {
    vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m1" } });
    const { link, onRecorded } = renderButton();
    expect(link).toHaveAttribute("href", "https://wa.me/6281234567001?text=Halo");
    expect(link).toHaveAttribute("target", "_blank");

    fireEvent.click(link);

    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "a1", kind: "PENGINGAT", scheduledFor: SHOWN });
  });

  it("pencatatan ditolak server: pesan galatnya tampil", async () => {
    vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: false, error: "Booking ini belum terkonfirmasi." });
    const { link, onRecorded } = renderButton();
    fireEvent.click(link);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Pengiriman belum tercatat: Booking ini belum terkonfirmasi."),
    );
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("jaringan gagal: admin diberi tahu bahwa pengiriman belum tercatat", async () => {
    vi.mocked(recordAppointmentMessage).mockRejectedValue(new Error("offline"));
    const { link, onRecorded } = renderButton();
    fireEvent.click(link);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Pengiriman belum tercatat. Tekan lagi bila WhatsApp sudah terkirim."),
    );
    expect(onRecorded).not.toHaveBeenCalled();
  });
});

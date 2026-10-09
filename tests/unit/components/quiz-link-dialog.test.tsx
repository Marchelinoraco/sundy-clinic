import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuizLinkDialog } from "@/components/admin/quiz-link-dialog";
import { recordAppointmentMessage } from "@/server/appointment-message";
import { getQuizLink, rotateQuizLink } from "@/server/quiz-link-admin";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/quiz-link-admin", () => ({ getQuizLink: vi.fn(), rotateQuizLink: vi.fn() }));
vi.mock("@/server/appointment-message", () => ({ recordAppointmentMessage: vi.fn() }));

const SCHEDULE = new Date("2026-10-05T03:00:00Z");
const INFO = {
  url: "https://sundyclinic.com/isi#kode-lama",
  message: { text: "Halo Budi, ini SunDY Clinic.", link: "https://wa.me/6281234567001?text=Halo" },
  scheduledFor: SCHEDULE,
};
const TARGET = { appointmentId: "a1", code: "SDY-WALK", patientName: "Budi Walkin" };

function renderDialog() {
  const onOpenChange = vi.fn();
  renderAdmin(<QuizLinkDialog target={TARGET} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getQuizLink).mockResolvedValue({ ok: true, data: INFO });
  vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m1" } });
});

describe("QuizLinkDialog (spec C3 4.2)", () => {
  it("QR, buka di perangkat ini, dan salin link", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Link kuis — SDY-WALK" })).toHaveTextContent("Budi Walkin");
    const qr = await screen.findByRole("img", { name: "QR link kuis" });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    const open = screen.getByRole("link", { name: "Buka di perangkat ini" });
    expect(open).toHaveAttribute("href", INFO.url);
    expect(open).toHaveAttribute("target", "_blank");
    await user.click(screen.getByRole("button", { name: "Salin link" }));
    expect(await navigator.clipboard.readText()).toBe(INFO.url);
    expect(getQuizLink).toHaveBeenCalledWith("a1");
  });

  it("Kirim link via WA mencatat LINK_KUIS dengan jadwal yang tertulis", async () => {
    renderDialog();
    const send = await screen.findByRole("link", { name: "Kirim link via WA" });
    expect(send).toHaveAttribute("href", INFO.message.link);
    send.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(send);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({ appointmentId: "a1", kind: "LINK_KUIS", scheduledFor: SCHEDULE }),
    );
  });

  it("Ganti link meminta konfirmasi lalu menampilkan link baru", async () => {
    vi.mocked(rotateQuizLink).mockResolvedValue({ ok: true, data: { ...INFO, url: "https://sundyclinic.com/isi#kode-baru" } });
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole("button", { name: "Ganti link" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Link lama langsung tidak berlaku");
    expect(rotateQuizLink).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ganti" }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Buka di perangkat ini" })).toHaveAttribute(
        "href",
        "https://sundyclinic.com/isi#kode-baru",
      ),
    );
    expect(rotateQuizLink).toHaveBeenCalledWith("a1");
  });

  it("link tidak tersedia: keterangan, tanpa tombol", async () => {
    vi.mocked(getQuizLink).mockResolvedValue({ ok: true, data: null });
    renderDialog();
    expect(await screen.findByText(/Link kuis tidak tersedia/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ganti link" })).not.toBeInTheDocument();
  });
});

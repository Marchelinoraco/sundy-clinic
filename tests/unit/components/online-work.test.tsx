import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { OnlineWorkView } from "@/components/admin/online-work";
import type { OnlineWorkRow } from "@/server/encounter-read";
import { recordContactAttempt, startOnlineConsultation } from "@/server/online-consultation";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/online-consultation", () => ({ startOnlineConsultation: vi.fn(), recordContactAttempt: vi.fn() }));

const row = (patch: Partial<OnlineWorkRow>): OnlineWorkRow => ({
  appointmentId: "a1",
  code: "SDY-ON01",
  phase: "UPCOMING",
  patientName: "Siti Rahayu",
  patientRecordNumber: "SDY-2026-0001",
  whatsapp: "6281234567890",
  whatsappLink: "https://wa.me/6281234567890",
  doctorName: "dr. Diane",
  purposeLabel: "Slimming",
  intakeId: "i1",
  windows: [{ label: "Rabu, 7 Oktober 2026, 19.00–21.00", current: false }],
  lastAttempt: null,
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("OnlineWorkView", () => {
  it("mengelompokkan Sekarang, Hari ini, dan Mendatang, dengan rentang yang berlangsung ditandai", () => {
    render(
      <OnlineWorkView
        rows={[
          row({ appointmentId: "n", patientName: "Rina", phase: "NOW", windows: [{ label: "Selasa, 6 Oktober 2026, 10.00–12.00", current: true }] }),
          row({ appointmentId: "t", patientName: "Budi", phase: "TODAY" }),
          row({}),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Sekarang" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hari ini" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mendatang" })).toBeInTheDocument();
    const now = screen.getByText("Rina").closest("li")!;
    expect(within(now).getByText("sedang berlangsung")).toBeInTheDocument();
  });

  it("menampilkan WA yang bisa diketuk, tujuan, percobaan terakhir, dan Lihat isian", () => {
    render(<OnlineWorkView rows={[row({ lastAttempt: "Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)" })]} />);
    expect(screen.getByRole("link", { name: /6281234567890/ })).toHaveAttribute("href", "https://wa.me/6281234567890");
    expect(screen.getByText("Slimming")).toBeInTheDocument();
    expect(screen.getByText("Dicoba Sel, 6 Okt 08.10 — tidak terhubung (dr. Diane)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
  });

  it("nama dokter hanya tampil bila ada lebih dari satu dokter", () => {
    const { rerender } = render(<OnlineWorkView rows={[row({})]} />);
    expect(screen.queryByText("dr. Diane")).not.toBeInTheDocument();
    rerender(<OnlineWorkView rows={[row({}), row({ appointmentId: "a2", doctorName: "dr. Budi" })]} />);
    expect(screen.getByText("dr. Diane")).toBeInTheDocument();
  });

  it("Mulai konsultasi membuka halaman kunjungan yang dikembalikan server", async () => {
    const user = userEvent.setup();
    vi.mocked(startOnlineConsultation).mockResolvedValue({ ok: true, data: { encounterId: "e9" } });
    render(<OnlineWorkView rows={[row({})]} />);
    await user.click(screen.getByRole("button", { name: "Mulai konsultasi" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kunjungan/e9"));
    expect(startOnlineConsultation).toHaveBeenCalledWith("a1");
  });

  it("Mulai konsultasi yang ditolak menampilkan galat dan tidak berpindah halaman", async () => {
    const user = userEvent.setup();
    vi.mocked(startOnlineConsultation).mockResolvedValue({
      ok: false,
      error: "Booking ini sudah berstatus dibatalkan. Muat ulang halaman.",
    });
    render(<OnlineWorkView rows={[row({})]} />);
    await user.click(screen.getByRole("button", { name: "Mulai konsultasi" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Booking ini sudah berstatus dibatalkan. Muat ulang halaman."));
    expect(push).not.toHaveBeenCalled();
  });

  it("Tidak terhubung mencatat percobaan lalu memuat ulang daftar", async () => {
    const user = userEvent.setup();
    vi.mocked(recordContactAttempt).mockResolvedValue({ ok: true, data: undefined });
    render(<OnlineWorkView rows={[row({})]} />);
    await user.click(screen.getByRole("button", { name: "Tidak terhubung" }));
    await waitFor(() => expect(recordContactAttempt).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("tanpa booking: keterangan kosong", () => {
    render(<OnlineWorkView rows={[]} />);
    expect(screen.getByText("Tidak ada konsultasi online yang menunggu.")).toBeInTheDocument();
  });
});

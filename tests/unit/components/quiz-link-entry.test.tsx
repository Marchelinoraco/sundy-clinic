import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuizLinkEntry } from "@/components/pendaftaran/quiz-link-entry";
import { getQuizLinkPage } from "@/server/quiz-link-public";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/quiz-link-public", () => ({ getQuizLinkPage: vi.fn(), submitQuizLink: vi.fn() }));

const CODE = "cmupobz6200022ovuddaolzdc.AAAAAAAAAAAAAAAAAAAAAA";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, "", `/isi#${CODE}`);
});

describe("QuizLinkEntry", () => {
  it("membaca kode dari bagian # lalu menampilkan kuis", async () => {
    vi.mocked(getQuizLinkPage).mockResolvedValue({
      ok: true,
      data: {
        state: "OPEN",
        firstName: "Maria",
        serviceName: "Konsultasi Dokter",
        startAt: new Date("2026-10-05T03:00:00Z"),
        staffName: "dr. Diane",
        branchName: "SunDY Mahakeret",
        kind: "LENGKAP",
        missing: [],
        feeConsent: null,
    online: null,
      },
    });
    render(<QuizLinkEntry />);
    expect(await screen.findByText("Halo Maria")).toBeInTheDocument();
    expect(getQuizLinkPage).toHaveBeenCalledWith(CODE);
  });

  it("link tidak berlaku: pesan dan tombol WhatsApp klinik", async () => {
    vi.mocked(getQuizLinkPage).mockResolvedValue({ ok: true, data: { state: "CLOSED" } });
    render(<QuizLinkEntry />);
    expect(await screen.findByRole("heading", { name: "Link ini sudah tidak berlaku" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hubungi via WhatsApp" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/wa\.me\/6285172228900\?text=/),
    );
  });

  it("kuis sudah dikirim: terima kasih", async () => {
    vi.mocked(getQuizLinkPage).mockResolvedValue({ ok: true, data: { state: "SUBMITTED" } });
    render(<QuizLinkEntry />);
    expect(await screen.findByRole("heading", { name: "Terima kasih, sudah kami terima" })).toBeInTheDocument();
  });

  it("tanpa kode: langsung tidak berlaku, tanpa memanggil server", async () => {
    window.history.replaceState(null, "", "/isi");
    render(<QuizLinkEntry />);
    expect(await screen.findByRole("heading", { name: "Link ini sudah tidak berlaku" })).toBeInTheDocument();
    expect(getQuizLinkPage).not.toHaveBeenCalled();
  });

  it("server menolak (mis. terlalu sering): pesan gagal memuat", async () => {
    vi.mocked(getQuizLinkPage).mockResolvedValue({ ok: false, error: "Terlalu banyak percobaan." });
    render(<QuizLinkEntry />);
    expect(await screen.findByText(/Halaman gagal dimuat/)).toBeInTheDocument();
  });
});

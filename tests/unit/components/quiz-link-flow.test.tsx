import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { EMPTY_LINK_IDENTITY } from "@/components/pendaftaran/link-identity-step";
import { linkDraftKey, QuizLinkFlow } from "@/components/pendaftaran/quiz-link-flow";
import type { QuizLinkPage } from "@/lib/quiz-link";
import { submitQuizLink } from "@/server/quiz-link-public";
import { aestheticReturningPatient, slimmingNewPatient } from "../../fixtures/quiz-answers-v2";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/server/quiz-link-public", () => ({ submitQuizLink: vi.fn() }));

type OpenPage = Extract<QuizLinkPage, { state: "OPEN" }>;
const CODE = "cmupobz6200022ovuddaolzdc.AAAAAAAAAAAAAAAAAAAAAA";
const PAGE: OpenPage = {
  state: "OPEN",
  firstName: "Maria",
  serviceName: "Konsultasi Dokter",
  startAt: new Date("2026-10-05T03:00:00Z"),
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  kind: "PENDEK",
  missing: ["birthDate", "occupation"],
  feeConsent: { bookingFee: 100000 },
};

function seedDraft(answers: unknown, screen: string) {
  sessionStorage.setItem(linkDraftKey(CODE), JSON.stringify({ answers, screen, identity: EMPTY_LINK_IDENTITY }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => sessionStorage.clear());

describe("QuizLinkFlow", () => {
  it("menyapa dengan nama depan, menampilkan jadwal, dan tidak menanyakan 'Pernah konsultasi?'", async () => {
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    expect(await screen.findByText("Halo Maria")).toBeInTheDocument();
    expect(screen.getByText("Konsultasi Dokter · Senin, 5 Oktober 2026 pukul 11.00 WITA")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Apa yang ingin Anda konsultasikan?" })).toBeInTheDocument();
    expect(screen.queryByText("Pernah konsultasi atau treatment di SunDY Clinic?")).not.toBeInTheDocument();
  });

  it("kuis pendek: setelah tujuan langsung ke cerita kunjungan ini", async () => {
    const user = userEvent.setup();
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    await user.click(await screen.findByRole("radio", { name: /^Aesthetic/ }));
    expect(await screen.findByRole("heading", { name: "Keluhan atau treatment yang diinginkan kali ini?" })).toBeInTheDocument();
  });

  it("tombol Kembali browser mundur satu pertanyaan, dan kode di # tetap di URL", async () => {
    window.history.replaceState(null, "", `/isi#${CODE}`);
    const user = userEvent.setup();
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    await user.click(await screen.findByRole("radio", { name: /^Aesthetic/ }));
    await screen.findByRole("heading", { name: "Keluhan atau treatment yang diinginkan kali ini?" });
    expect(window.location.hash).toBe(`#${CODE}`);
    act(() => window.history.back());
    expect(await screen.findByRole("heading", { name: "Apa yang ingin Anda konsultasikan?" })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#${CODE}`);
  });

  it("jawaban dan layar terakhir kembali setelah halaman dimuat ulang", async () => {
    seedDraft(aestheticReturningPatient, "P1");
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Keluhan atau treatment yang diinginkan kali ini?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Jawaban Anda")).toHaveValue(aestheticReturningPatient.returning.story);
  });

  it("draf dengan jenis kuis yang sudah tidak cocok dibuang", async () => {
    seedDraft(slimmingNewPatient, "D");
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Apa yang ingin Anda konsultasikan?" })).toBeInTheDocument();
  });

  it("data diri hanya menanyakan kolom yang kosong; persetujuan biaya hanya bila perlu", async () => {
    seedDraft(aestheticReturningPatient, "D");
    const { unmount } = render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={vi.fn()} />);
    expect(await screen.findByLabelText("Tanggal lahir")).toBeInTheDocument();
    expect(screen.getByLabelText("Pekerjaan")).toBeInTheDocument();
    expect(screen.queryByLabelText("Alamat")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Jenis kelamin" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nama lengkap")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mentransfer biaya booking Rp 100\.000/ })).toBeInTheDocument();
    unmount();

    render(<QuizLinkFlow code={CODE} page={{ ...PAGE, missing: [], feeConsent: null }} onSubmitted={vi.fn()} />);
    expect(await screen.findByText("Data diri Anda sudah lengkap di klinik.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /mentransfer biaya booking/ })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Kebijakan Privasi/ })).toBeInTheDocument();
  });

  it("Kirim mengirim jawaban, hanya kolom yang ditanyakan, dan persetujuan", async () => {
    vi.mocked(submitQuizLink).mockResolvedValue({ ok: true, data: { state: "SUBMITTED" } });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    seedDraft(aestheticReturningPatient, "D");
    render(<QuizLinkFlow code={CODE} page={PAGE} onSubmitted={onSubmitted} />);

    fireEvent.change(await screen.findByLabelText("Tanggal lahir"), { target: { value: "1990-05-17" } });
    await user.type(screen.getByLabelText("Pekerjaan"), "Guru");
    await user.click(screen.getByRole("checkbox", { name: /Kebijakan Privasi/ }));
    await user.click(screen.getByRole("checkbox", { name: /mentransfer biaya booking/ }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(submitQuizLink).toHaveBeenCalledWith({
      code: CODE,
      answers: expect.objectContaining({ patientType: "LAMA", purpose: "AESTHETIC" }),
      identity: { birthDate: "1990-05-17", occupation: "Guru" },
      consentData: true,
      consentFee: true,
      website: "",
    });
    expect(sessionStorage.getItem(linkDraftKey(CODE))).toBeNull();
  });

  it("data diri lengkap: Kirim tanpa kolom data diri apa pun", async () => {
    vi.mocked(submitQuizLink).mockResolvedValue({ ok: true, data: { state: "SUBMITTED" } });
    const user = userEvent.setup();
    seedDraft(aestheticReturningPatient, "D");
    render(<QuizLinkFlow code={CODE} page={{ ...PAGE, missing: [], feeConsent: null }} onSubmitted={vi.fn()} />);
    await user.click(await screen.findByRole("checkbox", { name: /Kebijakan Privasi/ }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));
    await waitFor(() => expect(submitQuizLink).toHaveBeenCalledWith(expect.objectContaining({ identity: {} })));
  });

  it("galat server tampil sebagai toast, dan formulir tetap terbuka", async () => {
    vi.mocked(submitQuizLink).mockResolvedValue({
      ok: false,
      error: "Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp.",
    });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    seedDraft(aestheticReturningPatient, "D");
    render(<QuizLinkFlow code={CODE} page={{ ...PAGE, missing: [], feeConsent: null }} onSubmitted={onSubmitted} />);
    await user.click(await screen.findByRole("checkbox", { name: /Kebijakan Privasi/ }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Link ini sudah tidak berlaku. Hubungi kami lewat WhatsApp."),
    );
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Kirim" })).toBeInTheDocument();
  });
});

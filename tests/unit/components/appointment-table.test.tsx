import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { getMatchCandidates } from "@/server/intake";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({
  cancelAppointment: vi.fn(),
  markAttended: vi.fn(),
  markNoShow: vi.fn(),
  verifyAppointment: vi.fn(),
}));
vi.mock("@/server/intake", () => ({
  createPatientFromIntake: vi.fn(),
  getMatchCandidates: vi.fn(),
  matchPatient: vi.fn(),
}));

const base: BookingRow = {
  id: "a1",
  code: "SDY-8F3K",
  status: "MENUNGGU_KONFIRMASI",
  timeLabel: "15.00–15.30",
  patientName: "Siti Rahayu",
  patientRecordNumber: "SDY-2026-0001",
  serviceName: "Konsultasi Dokter",
  staffName: "Dr. Diane",
  branchName: "SunDY Mahakeret",
  source: "SITUS",
  sourceLabel: "Situs",
  notes: null,
  confirmation: null,
  transferInstruction: null,
  needsMatch: false,
  isSiteBooking: true,
  intakeId: "i1",
  intakeStatus: "TERISI",
  patientId: "p1",
};

const waRow: BookingRow = {
  ...base,
  id: "a2",
  code: "SDY-WA01",
  source: "WHATSAPP",
  sourceLabel: "WhatsApp",
  isSiteBooking: false,
  intakeId: null,
  intakeStatus: null,
  transferInstruction: { text: "Halo Siti, mohon transfer…", link: "https://wa.me/6281234567890?text=Halo" },
};

async function openMenu(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getByRole("button", { name: `Aksi lain ${code}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMatchCandidates).mockResolvedValue({
    ok: true,
    data: {
      code: "SDY-8F3K",
      intake: { name: "Siti Rahayu", whatsapp: "6281234567890", birthDateLabel: null, claimsReturning: false },
      candidates: [],
    },
  });
});

describe("AppointmentTable pencocokan pasien", () => {
  it("booking situs yang belum dicocokkan menawarkan Cocokkan pasien dan belum Verifikasi", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[{ ...base, needsMatch: true, patientRecordNumber: "—" }]} canReadRecords={false} />);
    expect(screen.queryByRole("button", { name: "Verifikasi" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cocokkan pasien" }));
    expect(await screen.findByRole("dialog", { name: "Cocokkan pasien — SDY-8F3K" })).toBeInTheDocument();
    expect(getMatchCandidates).toHaveBeenCalledWith("a1");
  });

  it("booking situs yang sudah dicocokkan: Verifikasi terlihat, Ganti pasien di menu membuka dialog", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
    await openMenu(user, "SDY-8F3K");
    await user.click(screen.getByRole("menuitem", { name: "Ganti pasien" }));
    expect(await screen.findByRole("dialog", { name: "Cocokkan pasien — SDY-8F3K" })).toBeInTheDocument();
  });

  it("booking situs yang sudah terkonfirmasi tidak lagi menawarkan Ganti pasien", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[{ ...base, status: "TERKONFIRMASI" }]} canReadRecords={false} />);
    await openMenu(user, "SDY-8F3K");
    expect(screen.queryByRole("menuitem", { name: "Ganti pasien" })).not.toBeInTheDocument();
  });
});

describe("AppointmentTable aksi per baris (spec C1 5.2)", () => {
  it("booking WA menunggu: Verifikasi dan Kirim instruksi transfer terlihat, sisanya di menu", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[waRow]} canReadRecords />);
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kirim instruksi transfer" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567890?text=Halo",
    );
    expect(screen.queryByRole("button", { name: "Batalkan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cocokkan pasien" })).not.toBeInTheDocument();
    await openMenu(user, "SDY-WA01");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Salin instruksi transfer",
      "Hadir",
      "Tidak hadir",
      "Batalkan",
    ]);
  });

  it("Salin instruksi transfer menyalin teks instruksinya", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[waRow]} canReadRecords={false} />);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Salin instruksi transfer" }));
    expect(await navigator.clipboard.readText()).toBe("Halo Siti, mohon transfer…");
  });

  it("Batalkan dari menu membuka dialog alasan", async () => {
    const user = userEvent.setup();
    render(<AppointmentTable rows={[waRow]} canReadRecords={false} />);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Batalkan" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Batalkan booking SDY-WA01?");
  });

  it("terkonfirmasi: Hadir dan Kirim konfirmasi terlihat", () => {
    render(
      <AppointmentTable
        rows={[{ ...base, status: "TERKONFIRMASI", confirmation: { text: "Halo", link: "https://wa.me/62812?text=Halo" } }]}
        canReadRecords={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Hadir" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kirim konfirmasi" })).toHaveAttribute("href", "https://wa.me/62812?text=Halo");
  });

  it("Lihat isian ada di menu, hanya untuk yang berhak", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AppointmentTable rows={[base]} canReadRecords />);
    await openMenu(user, "SDY-8F3K");
    expect(screen.getByRole("menuitem", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    unmount();

    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    await openMenu(user, "SDY-8F3K");
    expect(screen.queryByRole("menuitem", { name: "Lihat isian" })).not.toBeInTheDocument();
  });

  it("baris tanpa aksi tidak menampilkan menu", () => {
    render(<AppointmentTable rows={[{ ...base, status: "SELESAI" }]} canReadRecords={false} />);
    expect(screen.queryByRole("button", { name: /Aksi lain/ })).not.toBeInTheDocument();
  });
});

describe("AppointmentTable batas", () => {
  it("menampilkan batas kedaluwarsa bila ada", () => {
    render(<AppointmentTable rows={[{ ...base, deadlineLabel: "Kedaluwarsa Sen, 5 Okt 15.00" }]} canReadRecords={false} />);
    expect(screen.getByText("Kedaluwarsa Sen, 5 Okt 15.00")).toHaveClass("text-amber-700");
  });

  it("batas transfer yang sudah lewat ditulis merah", () => {
    render(
      <AppointmentTable
        rows={[{ ...waRow, deadlineLabel: "Lewat batas transfer", deadlineOverdue: true }]}
        canReadRecords={false}
      />,
    );
    expect(screen.getByText("Lewat batas transfer")).toHaveClass("text-destructive");
  });

  it("tidak menampilkan apa pun bila tidak ada batas", () => {
    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.queryByText(/Kedaluwarsa|batas transfer/)).not.toBeInTheDocument();
  });
});

describe("AppointmentTable sorotan (spec C1 5.4)", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    // jsdom tidak punya scrollIntoView.
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("menyorot baris dari sorot dan menggulirnya ke tengah sekali", () => {
    render(<AppointmentTable rows={[base, waRow]} canReadRecords={false} highlightId="a2" />);
    const highlighted = document.querySelectorAll('[data-highlighted="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent("SDY-WA01");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("id yang tidak ada di daftar: tidak ada sorotan dan tidak ada galat", () => {
    render(<AppointmentTable rows={[base, waRow]} canReadRecords={false} highlightId="tidak-ada" />);
    expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("AppointmentTable status isian dan tautan pasien", () => {
  it("menampilkan status isian di bawah status booking", () => {
    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.getByText("Isian: belum diperiksa")).toBeInTheDocument();
  });

  it("tidak menampilkan status isian untuk booking tanpa isian", () => {
    render(<AppointmentTable rows={[{ ...base, intakeStatus: null, intakeId: null }]} canReadRecords={false} />);
    expect(screen.queryByText(/^Isian:/)).not.toBeInTheDocument();
  });

  it("nama pasien menaut ke halaman pasien, kecuali booking yang belum dicocokkan", () => {
    const { rerender } = render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.getByRole("link", { name: "Siti Rahayu" })).toHaveAttribute("href", "/admin/pasien/p1");

    rerender(<AppointmentTable rows={[{ ...base, patientId: null, needsMatch: true }]} canReadRecords={false} />);
    expect(screen.queryByRole("link", { name: "Siti Rahayu" })).not.toBeInTheDocument();
  });
});

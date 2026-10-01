import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { BookingDialogsProvider } from "@/components/admin/booking-dialogs";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { verifyAppointment } from "@/server/appointment";
import { getBookingMessage, recordAppointmentMessage } from "@/server/appointment-message";
import { getMatchCandidates } from "@/server/intake";
import { getStaffAvailabilityRange } from "@/server/schedule";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({
  cancelAppointment: vi.fn(),
  markAttended: vi.fn(),
  markNoShow: vi.fn(),
  verifyAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
}));
vi.mock("@/server/appointment-message", () => ({
  getBookingMessage: vi.fn(),
  recordAppointmentMessage: vi.fn(),
}));
vi.mock("@/server/intake", () => ({
  createPatientFromIntake: vi.fn(),
  getMatchCandidates: vi.fn(),
  matchPatient: vi.fn(),
}));
vi.mock("@/server/schedule", () => ({
  getStaffAvailabilityRange: vi.fn(),
  getStaffAvailabilityForAdmin: vi.fn(),
}));

const TODAY = "2026-10-05";

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
  messageNotes: [],
  reschedule: {
    appointmentId: "a1",
    code: "SDY-8F3K",
    patientName: "Siti Rahayu",
    startAt: combineWitaDateAndMinutes(TODAY, 15 * 60),
    durationMinutes: 30,
    staffId: "d1",
    staffName: "Dr. Diane",
    branchId: "b1",
    branchName: "SunDY Mahakeret",
  },
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
  reschedule: { ...base.reschedule, appointmentId: "a2", code: "SDY-WA01" },
};

function renderTable(rows: BookingRow[], options: { canReadRecords?: boolean; highlightId?: string } = {}) {
  return render(
    <BookingDialogsProvider today={TODAY}>
      <AppointmentTable rows={rows} canReadRecords={options.canReadRecords ?? false} highlightId={options.highlightId} />
    </BookingDialogsProvider>,
  );
}

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
  vi.mocked(getStaffAvailabilityRange).mockResolvedValue([]);
  vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m1" } });
});

describe("AppointmentTable pencocokan pasien", () => {
  it("booking situs yang belum dicocokkan menawarkan Cocokkan pasien dan belum Verifikasi", async () => {
    const user = userEvent.setup();
    renderTable([{ ...base, needsMatch: true, patientRecordNumber: "—" }]);
    expect(screen.queryByRole("button", { name: "Verifikasi" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cocokkan pasien" }));
    expect(await screen.findByRole("dialog", { name: "Cocokkan pasien — SDY-8F3K" })).toBeInTheDocument();
    expect(getMatchCandidates).toHaveBeenCalledWith("a1");
  });

  it("booking situs yang sudah dicocokkan: Verifikasi terlihat, Ganti pasien di menu membuka dialog", async () => {
    const user = userEvent.setup();
    renderTable([base]);
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
    await openMenu(user, "SDY-8F3K");
    await user.click(screen.getByRole("menuitem", { name: "Ganti pasien" }));
    expect(await screen.findByRole("dialog", { name: "Cocokkan pasien — SDY-8F3K" })).toBeInTheDocument();
  });

  it("booking situs yang sudah terkonfirmasi tidak lagi menawarkan Ganti pasien", async () => {
    const user = userEvent.setup();
    renderTable([{ ...base, status: "TERKONFIRMASI" }]);
    await openMenu(user, "SDY-8F3K");
    expect(screen.queryByRole("menuitem", { name: "Ganti pasien" })).not.toBeInTheDocument();
  });
});

describe("AppointmentTable aksi per baris", () => {
  it("booking WA menunggu: Verifikasi dan Kirim instruksi transfer terlihat, sisanya di menu", async () => {
    const user = userEvent.setup();
    renderTable([waRow], { canReadRecords: true });
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kirim instruksi transfer" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567890?text=Halo",
    );
    await openMenu(user, "SDY-WA01");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Salin instruksi transfer",
      "Hadir",
      "Tidak hadir",
      "Pindah jadwal",
      "Batalkan",
    ]);
  });

  it("Kirim instruksi transfer mencatat pengiriman", async () => {
    renderTable([waRow]);
    const link = screen.getByRole("link", { name: "Kirim instruksi transfer" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({
        appointmentId: "a2",
        kind: "INSTRUKSI_TRANSFER",
        scheduledFor: waRow.reschedule.startAt,
      }),
    );
  });

  it("Salin instruksi transfer menyalin teks tanpa mencatat pengiriman", async () => {
    const user = userEvent.setup();
    renderTable([waRow]);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Salin instruksi transfer" }));
    expect(await navigator.clipboard.readText()).toBe("Halo Siti, mohon transfer…");
    expect(recordAppointmentMessage).not.toHaveBeenCalled();
  });

  it("Batalkan dari menu membuka dialog alasan", async () => {
    const user = userEvent.setup();
    renderTable([waRow]);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Batalkan" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Batalkan booking SDY-WA01?");
  });

  it("Pindah jadwal dari menu membuka dialog untuk booking itu", async () => {
    const user = userEvent.setup();
    renderTable([waRow]);
    await openMenu(user, "SDY-WA01");
    await user.click(screen.getByRole("menuitem", { name: "Pindah jadwal" }));
    expect(await screen.findByRole("dialog", { name: "Pindah jadwal — SDY-WA01" })).toBeInTheDocument();
    await waitFor(() =>
      expect(getStaffAvailabilityRange).toHaveBeenCalledWith(expect.objectContaining({ excludeAppointmentId: "a2" })),
    );
  });

  it("terkonfirmasi: Hadir dan Kirim konfirmasi; mengirim konfirmasi mencatatnya", async () => {
    renderTable([{ ...base, status: "TERKONFIRMASI", confirmation: { text: "Halo", link: "https://wa.me/62812?text=Halo" } }]);
    expect(screen.getByRole("button", { name: "Hadir" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Kirim konfirmasi" });
    expect(link).toHaveAttribute("href", "https://wa.me/62812?text=Halo");
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({
        appointmentId: "a1",
        kind: "KONFIRMASI",
        scheduledFor: base.reschedule.startAt,
      }),
    );
  });

  it("Lihat isian ada di menu, hanya untuk yang berhak", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTable([base], { canReadRecords: true });
    await openMenu(user, "SDY-8F3K");
    expect(screen.getByRole("menuitem", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    unmount();

    renderTable([base]);
    await openMenu(user, "SDY-8F3K");
    expect(screen.queryByRole("menuitem", { name: "Lihat isian" })).not.toBeInTheDocument();
  });

  it("baris tanpa aksi tidak menampilkan menu", () => {
    renderTable([{ ...base, status: "SELESAI" }]);
    expect(screen.queryByRole("button", { name: /Aksi lain/ })).not.toBeInTheDocument();
  });
});

describe("AppointmentTable setelah Verifikasi (spec C2 3.1)", () => {
  it("dialog tetap muncul walau booking yang diverifikasi adalah yang terakhir menunggu", async () => {
    let dropRows = () => {};
    vi.mocked(verifyAppointment).mockImplementation(async () => {
      // Seperti halaman booking: revalidasi mengosongkan "Menunggu konfirmasi", dan bagiannya hilang.
      dropRows();
      return { ok: true, data: {} as never };
    });
    vi.mocked(getBookingMessage).mockResolvedValue({
      ok: true,
      data: {
        kind: "KONFIRMASI",
        text: "Halo Siti",
        link: "https://wa.me/6281234567890?text=Halo%20Siti",
        scheduledFor: waRow.reschedule.startAt,
      },
    });
    function PendingSection() {
      const [rows, setRows] = useState([waRow]);
      dropRows = () => setRows([]);
      return rows.length > 0 ? <AppointmentTable rows={rows} canReadRecords={false} /> : <p>Kosong</p>;
    }
    const user = userEvent.setup();
    render(
      <BookingDialogsProvider today={TODAY}>
        <PendingSection />
      </BookingDialogsProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Verifikasi" }));

    expect(await screen.findByRole("dialog", { name: "✓ Booking SDY-WA01 terkonfirmasi" })).toBeInTheDocument();
  });

  it("dialog konfirmasi langsung muncul dengan tautan WA ke pasien", async () => {
    vi.mocked(verifyAppointment).mockResolvedValue({ ok: true, data: {} as never });
    vi.mocked(getBookingMessage).mockResolvedValue({
      ok: true,
      data: {
        kind: "KONFIRMASI",
        text: "Halo Siti",
        link: "https://wa.me/6281234567890?text=Halo%20Siti",
        scheduledFor: waRow.reschedule.startAt,
      },
    });
    const user = userEvent.setup();
    renderTable([waRow]);

    await user.click(screen.getByRole("button", { name: "Verifikasi" }));

    const dialog = await screen.findByRole("dialog", { name: "✓ Booking SDY-WA01 terkonfirmasi" });
    expect(dialog).toHaveTextContent("Siti Rahayu");
    expect(screen.getByRole("link", { name: "Kirim konfirmasi via WA" })).toHaveAttribute(
      "href",
      "https://wa.me/6281234567890?text=Halo%20Siti",
    );
    expect(getBookingMessage).toHaveBeenCalledWith("a2");
    expect(screen.getByText(/tetap tercatat di Pengingat/)).toBeInTheDocument();
  });

  it("Verifikasi gagal: tidak ada dialog", async () => {
    vi.mocked(verifyAppointment).mockResolvedValue({ ok: false, error: "Booking ini sudah berstatus terkonfirmasi." });
    const user = userEvent.setup();
    renderTable([waRow]);
    await user.click(screen.getByRole("button", { name: "Verifikasi" }));
    await waitFor(() => expect(verifyAppointment).toHaveBeenCalled());
    expect(getBookingMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("AppointmentTable keterangan dan batas", () => {
  it("menampilkan keterangan pesan yang sudah terkirim", () => {
    renderTable([{ ...base, messageNotes: ["Konfirmasi terkirim 10.12 · Rina", "Diingatkan 09.40 · Akan datang"] }]);
    expect(screen.getByText("Konfirmasi terkirim 10.12 · Rina")).toBeInTheDocument();
    expect(screen.getByText("Diingatkan 09.40 · Akan datang")).toBeInTheDocument();
  });

  it("menampilkan batas kedaluwarsa bila ada", () => {
    renderTable([{ ...base, deadlineLabel: "Kedaluwarsa Sen, 5 Okt 15.00" }]);
    expect(screen.getByText("Kedaluwarsa Sen, 5 Okt 15.00")).toHaveClass("text-amber-700");
  });

  it("batas transfer yang sudah lewat ditulis merah", () => {
    renderTable([{ ...waRow, deadlineLabel: "Lewat batas transfer", deadlineOverdue: true }]);
    expect(screen.getByText("Lewat batas transfer")).toHaveClass("text-destructive");
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
    renderTable([base, waRow], { highlightId: "a2" });
    const highlighted = document.querySelectorAll('[data-highlighted="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveTextContent("SDY-WA01");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("id yang tidak ada di daftar: tidak ada sorotan dan tidak ada galat", () => {
    renderTable([base, waRow], { highlightId: "tidak-ada" });
    expect(document.querySelectorAll('[data-highlighted="true"]')).toHaveLength(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("AppointmentTable status isian dan tautan pasien", () => {
  it("menampilkan status isian di bawah status booking", () => {
    renderTable([base]);
    expect(screen.getByText("Isian: belum diperiksa")).toBeInTheDocument();
  });

  it("nama pasien menaut ke halaman pasien, kecuali booking yang belum dicocokkan", () => {
    const { unmount } = renderTable([base]);
    expect(screen.getByRole("link", { name: "Siti Rahayu" })).toHaveAttribute("href", "/admin/pasien/p1");
    unmount();
    renderTable([{ ...base, patientId: null, needsMatch: true }]);
    expect(screen.queryByRole("link", { name: "Siti Rahayu" })).not.toBeInTheDocument();
  });
});

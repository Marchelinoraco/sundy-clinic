import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReminderWorklistView } from "@/components/admin/reminder-worklist";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { recordAppointmentMessage, recordReminderReply, revokeAppointmentMessage } from "@/server/appointment-message";
import type { ReminderRow, ReminderWorklist } from "@/server/reminder";
import { getStaffAvailabilityRange } from "@/server/schedule";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/appointment", () => ({ rescheduleAppointment: vi.fn() }));
vi.mock("@/server/appointment-message", () => ({
  getBookingMessage: vi.fn(),
  recordAppointmentMessage: vi.fn(),
  recordReminderReply: vi.fn(),
  revokeAppointmentMessage: vi.fn(),
}));
vi.mock("@/server/schedule", () => ({
  getStaffAvailabilityRange: vi.fn(),
  getStaffAvailabilityForAdmin: vi.fn(),
}));

const TODAY = "2026-10-03"; // Sabtu
const monday = (hour: number) => combineWitaDateAndMinutes("2026-10-05", hour * 60);

function row(id: string, name: string, startAt: Date, patch: Partial<ReminderRow> = {}): ReminderRow {
  return {
    appointmentId: id,
    code: `SDY-${id.toUpperCase()}`,
    patientName: name,
    startAt,
    staffName: "dr. Diane",
    branchName: "SunDY Mahakeret",
    channel: "KLINIK",
    onlineLabel: null,
    confirmation: { text: `Konfirmasi ${name}`, link: `https://wa.me/6281234567${id}?text=k` },
    reminder: { text: `Pengingat ${name}`, link: `https://wa.me/6281234567${id}?text=p` },
    overdue: false,
    shifted: false,
    reminderSent: null,
    reschedule: {
      appointmentId: id,
      code: `SDY-${id.toUpperCase()}`,
      patientName: name,
      startAt,
      durationMinutes: 30,
      staffId: "d1",
      staffName: "dr. Diane",
      branchId: "b1",
      branchName: "SunDY Mahakeret",
    },
    ...patch,
  };
}

const sentAt = combineWitaDateAndMinutes(TODAY, 9 * 60 + 40);

const WORKLIST: ReminderWorklist = {
  today: TODAY,
  confirm: [row("001", "Grace Lumi", monday(11))],
  remind: [
    row("002", "Yohana Sari", combineWitaDateAndMinutes(TODAY, 15 * 60), { overdue: true }),
    row("003", "Stevanie Rondo", monday(11.5), { shifted: true }),
  ],
  reminded: [
    row("004", "Anita Kaunang", monday(14), {
      reminderSent: { messageId: "m4", sentAt, sentByName: "Rina", reply: null },
    }),
    row("005", "Budi Pangemanan", monday(15.5), {
      reminderSent: { messageId: "m5", sentAt, sentByName: "Rina", reply: "AKAN_DATANG" },
    }),
    row("006", "Citra Mamahit", monday(16), {
      reminderSent: { messageId: "m6", sentAt, sentByName: "Rina", reply: "MINTA_PINDAH" },
    }),
  ],
};

const region = (name: RegExp) => screen.getByRole("region", { name });
const item = (regionName: RegExp, text: string) =>
  within(region(regionName)).getAllByRole("listitem").find((li) => li.textContent?.includes(text))!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordAppointmentMessage).mockResolvedValue({ ok: true, data: { id: "m9" } });
  vi.mocked(recordReminderReply).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(revokeAppointmentMessage).mockResolvedValue({ ok: true, data: undefined });
  vi.mocked(getStaffAvailabilityRange).mockResolvedValue([]);
});

describe("ReminderWorklistView", () => {
  it("tiga kotak dengan jumlahnya, dan 'Tidak ada' bila kosong", () => {
    const { unmount } = render(<ReminderWorklistView worklist={WORKLIST} />);
    expect(screen.getByRole("heading", { name: "Pengingat · Sabtu, 3 Oktober 2026" })).toBeInTheDocument();
    expect(region(/Konfirmasi belum dikirim \(1\)/)).toBeInTheDocument();
    expect(region(/Ingatkan sekarang \(2\)/)).toBeInTheDocument();
    expect(region(/Sudah diingatkan — catat balasannya \(3\)/)).toBeInTheDocument();
    unmount();

    render(<ReminderWorklistView worklist={{ today: TODAY, confirm: [], remind: [], reminded: [] }} />);
    expect(screen.getAllByText("Tidak ada.")).toHaveLength(3);
  });

  it("kotak 1: kirim konfirmasi mencatat jenis KONFIRMASI", async () => {
    render(<ReminderWorklistView worklist={WORKLIST} />);
    const link = within(item(/Konfirmasi belum dikirim/, "Grace Lumi")).getByRole("link", { name: "Kirim konfirmasi" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({
        appointmentId: "001",
        kind: "KONFIRMASI",
        scheduledFor: WORKLIST.confirm[0].startAt,
      }),
    );
  });

  it("kotak 2: yang terlambat ditandai merah, yang dimajukan diberi keterangan, tombol WA mencatat PENGINGAT", async () => {
    render(<ReminderWorklistView worklist={WORKLIST} />);
    const items = within(region(/Ingatkan sekarang/)).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Yohana Sari");
    expect(within(items[0]).getByText("terlambat")).toHaveClass("text-destructive");
    expect(items[1]).toHaveTextContent("Hari sebelumnya tutup — diingatkan hari ini");

    const link = within(items[1]).getByRole("link", { name: "Ingatkan via WA" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() =>
      expect(recordAppointmentMessage).toHaveBeenCalledWith({
        appointmentId: "003",
        kind: "PENGINGAT",
        scheduledFor: WORKLIST.remind[1].startAt,
      }),
    );
  });

  it("kotak 3: mencatat balasan, mengubahnya, dan membatalkan tanda", async () => {
    const user = userEvent.setup();
    render(<ReminderWorklistView worklist={WORKLIST} />);

    const anita = item(/Sudah diingatkan/, "Anita Kaunang");
    expect(anita).toHaveTextContent("diingatkan 09.40 oleh Rina");
    await user.click(within(anita).getByRole("button", { name: "Akan datang" }));
    expect(recordReminderReply).toHaveBeenCalledWith({ messageId: "m4", reply: "AKAN_DATANG" });

    const budi = item(/Sudah diingatkan/, "Budi Pangemanan");
    expect(budi).toHaveTextContent("✓ Akan datang");
    expect(within(budi).queryByRole("button", { name: "Tidak membalas" })).not.toBeInTheDocument();
    await user.click(within(budi).getByRole("button", { name: "ubah" }));
    await user.click(within(budi).getByRole("button", { name: "Tidak membalas" }));
    expect(recordReminderReply).toHaveBeenCalledWith({ messageId: "m5", reply: "TIDAK_MEMBALAS" });

    await user.click(within(anita).getByRole("button", { name: "Batalkan tanda" }));
    expect(revokeAppointmentMessage).toHaveBeenCalledWith("m4");
  });

  it("balasan Minta pindah menawarkan Pindah jadwal", async () => {
    const user = userEvent.setup();
    render(<ReminderWorklistView worklist={WORKLIST} />);
    const citra = item(/Sudah diingatkan/, "Citra Mamahit");
    expect(within(item(/Sudah diingatkan/, "Anita Kaunang")).queryByRole("button", { name: "Pindah jadwal" })).toBeNull();

    await user.click(within(citra).getByRole("button", { name: "Pindah jadwal" }));

    expect(await screen.findByRole("dialog", { name: "Pindah jadwal — SDY-006" })).toBeInTheDocument();
  });
});

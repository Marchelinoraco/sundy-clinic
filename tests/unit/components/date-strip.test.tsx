import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateStrip } from "@/components/admin/date-strip";
import { addDaysToDateString } from "@/lib/time";
import type { DayAvailability } from "@/server/availability";
import { getStaffAvailabilityRange } from "@/server/schedule";

vi.mock("@/server/schedule", () => ({ getStaffAvailabilityRange: vi.fn() }));

const TODAY = "2026-10-05"; // Senin
const day = (index: number, state: DayAvailability["state"], openCount = 0): DayAvailability => ({
  date: addDaysToDateString(TODAY, index),
  state,
  openCount,
});
/** 14 hari: hari yang diberikan, sisanya buka 8 jam. */
const strip = (first: DayAvailability[]): DayAvailability[] =>
  Array.from({ length: 14 }, (_, index) => first[index] ?? day(index, "OPEN", 8));

function renderStrip(patch: Partial<Parameters<typeof DateStrip>[0]> = {}) {
  const onSelect = vi.fn();
  const props = {
    staffId: "s1",
    branchId: "b1",
    durationMinutes: 30,
    today: TODAY,
    selected: "",
    onSelect,
    refreshKey: 0,
    ...patch,
  };
  const view = render(<DateStrip {...props} />);
  return { onSelect, props, ...view };
}

beforeEach(() => vi.clearAllMocks());

describe("DateStrip", () => {
  it("menampilkan jam kosong, penuh, dan tutup; hanya hari yang buka bisa dipilih", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(
      strip([day(0, "OPEN", 6), day(1, "FULL"), day(2, "CLOSED")]),
    );
    const user = userEvent.setup();
    const { onSelect } = renderStrip();

    const open = await screen.findByRole("button", { name: "Senin, 5 Oktober 2026 — 6 jam kosong" });
    expect(open).toHaveTextContent("6 jam");
    expect(screen.getByRole("button", { name: "Selasa, 6 Oktober 2026 — penuh" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rabu, 7 Oktober 2026 — tutup" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /— / })).toHaveLength(14);

    await user.click(open);
    expect(onSelect).toHaveBeenCalledWith("2026-10-05");
    expect(getStaffAvailabilityRange).toHaveBeenCalledWith({
      staffId: "s1",
      branchId: "b1",
      durationMinutes: 30,
      from: TODAY,
      days: 14,
    });
  });

  it("menandai tanggal yang sedang dipilih", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(strip([]));
    renderStrip({ selected: "2026-10-06" });
    expect(await screen.findByRole("button", { name: /^Selasa, 6 Oktober 2026/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("tanpa jadwal 14 hari: semua tutup dan ada petunjuk ke Pilih tanggal lain", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(Array.from({ length: 14 }, (_, i) => day(i, "CLOSED")));
    renderStrip();
    expect(
      await screen.findByText("Tidak ada jadwal dalam 14 hari ke depan — gunakan Pilih tanggal lain."),
    ).toBeInTheDocument();
  });

  it("Pilih tanggal lain membuka isian tanggal dengan batas hari ini", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(strip([]));
    const user = userEvent.setup();
    const { onSelect } = renderStrip();

    await user.click(screen.getByRole("button", { name: "Pilih tanggal lain" }));
    const input = screen.getByLabelText("Tanggal lain");
    expect(input).toHaveAttribute("min", TODAY);
    fireEvent.change(input, { target: { value: "2026-11-02" } });
    expect(onSelect).toHaveBeenCalledWith("2026-11-02");
  });

  it("dimuat ulang saat refreshKey naik", async () => {
    vi.mocked(getStaffAvailabilityRange).mockResolvedValue(strip([]));
    const { props, rerender } = renderStrip();
    await screen.findByRole("group", { name: "Pilih tanggal" });
    rerender(<DateStrip {...props} refreshKey={1} />);
    await screen.findByRole("group", { name: "Pilih tanggal" });
    expect(getStaffAvailabilityRange).toHaveBeenCalledTimes(2);
  });

  it("galat memuat: pesan, dan isian tanggal lain tetap bisa dipakai", async () => {
    vi.mocked(getStaffAvailabilityRange).mockRejectedValue(new Error("jaringan"));
    renderStrip();
    expect(await screen.findByText("Gagal memuat tanggal. Gunakan Pilih tanggal lain.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pilih tanggal lain" })).toBeInTheDocument();
  });
});

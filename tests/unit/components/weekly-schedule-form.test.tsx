import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyScheduleForm } from "@/components/admin/weekly-schedule-form";
import { saveWeeklySchedule } from "@/server/schedule";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/schedule", () => ({ saveWeeklySchedule: vi.fn() }));

const TEMPLATES = [{ weekday: 1, startMinute: 660, endMinute: 1140 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveWeeklySchedule).mockResolvedValue({ ok: true, data: undefined });
});

function renderForm() {
  renderAdmin(<WeeklyScheduleForm staffId="t1" branchId="b1" branchName="SunDY Mahakeret" templates={TEMPLATES} />);
  return screen.getByRole("region", { name: "Jam kerja mingguan · SunDY Mahakeret" });
}

describe("WeeklyScheduleForm", () => {
  it("Simpan aktif hanya bila ada perubahan; satu kali simpan untuk seminggu", async () => {
    const user = userEvent.setup();
    const card = renderForm();
    const save = within(card).getByRole("button", { name: "Simpan jam kerja" });
    expect(save).toBeDisabled();
    expect(within(card).getAllByText("Tutup")).toHaveLength(6);

    await user.click(within(card).getByRole("checkbox", { name: "Buka hari Minggu" }));
    expect(save).toBeEnabled();
    // <input type="time"> di jsdom: nilai diganti langsung, tidak diketik per huruf.
    fireEvent.change(within(card).getByLabelText("Selesai Minggu"), { target: { value: "13:00" } });
    await user.click(save);

    await waitFor(() => expect(saveWeeklySchedule).toHaveBeenCalledTimes(1));
    const { days } = vi.mocked(saveWeeklySchedule).mock.calls[0][0];
    expect(days).toHaveLength(7);
    expect(days.find((d) => d.weekday === 0)).toEqual({ weekday: 0, open: true, startMinute: 660, endMinute: 780 });
    expect(days.find((d) => d.weekday === 1)).toEqual({ weekday: 1, open: true, startMinute: 660, endMinute: 1140 });
  });

  it("dicentang lalu dibatalkan lagi: Simpan kembali nonaktif", async () => {
    const user = userEvent.setup();
    const card = renderForm();
    const sunday = within(card).getByRole("checkbox", { name: "Buka hari Minggu" });
    await user.click(sunday);
    await user.click(sunday);
    expect(within(card).getByRole("button", { name: "Simpan jam kerja" })).toBeDisabled();
  });

  it("jam kosong pada hari buka: pesan, tanpa memanggil server", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    const card = renderForm();
    fireEvent.change(within(card).getByLabelText("Mulai Senin"), { target: { value: "" } });
    await user.click(within(card).getByRole("button", { name: "Simpan jam kerja" }));
    expect(toast.error).toHaveBeenCalledWith("Isi jam mulai dan selesai untuk setiap hari yang buka.");
    expect(saveWeeklySchedule).not.toHaveBeenCalled();
  });
});

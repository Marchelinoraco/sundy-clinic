import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleExceptionList } from "@/components/admin/schedule-exception-list";
import { deleteScheduleException } from "@/server/schedule";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/schedule", () => ({ deleteScheduleException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteScheduleException).mockResolvedValue({ ok: true, data: undefined });
});

describe("ScheduleExceptionList", () => {
  it("Hapus meminta konfirmasi lalu menghapus", async () => {
    const user = userEvent.setup();
    renderAdmin(
      <ScheduleExceptionList
        exceptions={[{ id: "x1", dateLabel: "Rabu, 12 Februari 2031", kindLabel: "Jam tambahan", timeLabel: "19.00–21.00" }]}
      />,
    );
    expect(screen.getByRole("row", { name: /Rabu, 12 Februari 2031 Jam tambahan 19\.00–21\.00/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hapus" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Booking yang sudah ada tidak berubah.");
    expect(deleteScheduleException).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Hapus pengecualian" }));
    await waitFor(() => expect(deleteScheduleException).toHaveBeenCalledWith("x1"));
  });

  it("kosong: keterangan", () => {
    renderAdmin(<ScheduleExceptionList exceptions={[]} />);
    expect(screen.getByText("Belum ada pengecualian mulai hari ini.")).toBeInTheDocument();
  });
});

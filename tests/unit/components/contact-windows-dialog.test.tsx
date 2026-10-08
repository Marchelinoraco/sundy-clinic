import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactWindowsDialog } from "@/components/admin/contact-windows-dialog";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { updateContactWindows } from "@/server/online-consultation";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/online-consultation", () => ({ updateContactWindows: vi.fn() }));

const today = witaDateString(new Date());
const inThreeDays = addDaysToDateString(today, 3);
const target = {
  appointmentId: "a3",
  code: "SDY-ON01",
  patientName: "Siti Rahayu",
  windows: [{ date: addDaysToDateString(today, -5), startMinute: 600, endMinute: 720 }],
};

beforeEach(() => vi.clearAllMocks());

describe("ContactWindowsDialog", () => {
  it("mengganti rentang dan menyimpannya", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(updateContactWindows).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<ContactWindowsDialog target={target} today={today} open onOpenChange={onOpenChange} />);

    expect(screen.getByRole("dialog", { name: "Ubah waktu luang — SDY-ON01" })).toBeInTheDocument();
    setDateField("Tanggal waktu 1", inThreeDays);
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(updateContactWindows).toHaveBeenCalledWith({
        appointmentId: "a3",
        windows: [{ date: inThreeDays, startMinute: 600, endMinute: 720 }],
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("menolak tanggal yang sudah lewat tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderAdmin(<ContactWindowsDialog target={target} today={today} open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pilih tanggal antara hari ini dan 14 hari ke depan.");
    expect(updateContactWindows).not.toHaveBeenCalled();
  });
});

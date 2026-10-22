import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeVisitDialog } from "@/components/admin/package/change-visit-dialog";
import { changeNextVisit } from "@/server/patient-packages";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/patient-packages", () => ({ changeNextVisit: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

describe("ChangeVisitDialog (spec jadwal paket JP9, JP16)", () => {
  it("mengirim tanggal baru; batas tanggal dicek di layar; galat server tampil", async () => {
    vi.mocked(changeNextVisit).mockResolvedValueOnce({ ok: false, error: "Paket ini sudah tidak punya rencana kunjungan." });
    const user = userEvent.setup();
    renderAdmin(<ChangeVisitDialog packageId="pp1" nextVisitOn="2026-10-29" today="2026-10-22" expiresOn="2027-01-19" />);
    await user.click(screen.getByRole("button", { name: "Ubah tanggal rencana" }));
    const dialog = await screen.findByRole("dialog", { name: "Ubah tanggal rencana" });
    expect(within(dialog).getByText(/Kunjungan sesudahnya ikut bergeser/)).toBeInTheDocument();

    setDateField("Tanggal kunjungan berikutnya", "2026-10-21", within(dialog));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Tanggal rencana tidak boleh sebelum hari ini.");
    expect(changeNextVisit).not.toHaveBeenCalled();

    setDateField("Tanggal kunjungan berikutnya", "2026-11-02", within(dialog));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(changeNextVisit).toHaveBeenCalledWith({ packageId: "pp1", visitOn: "2026-11-02" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Paket ini sudah tidak punya rencana kunjungan.");
  });
});

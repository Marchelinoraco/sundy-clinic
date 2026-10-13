import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtendPackageDialog } from "@/components/admin/package/extend-package-dialog";
import { extendPatientPackage } from "@/server/patient-packages";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/patient-packages", () => ({ extendPatientPackage: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.clearAllMocks());

describe("ExtendPackageDialog", () => {
  it("mengirim tanggal baru dan alasan; galat isian tampil tanpa memanggil server", async () => {
    vi.mocked(extendPatientPackage).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<ExtendPackageDialog packageId="pp1" expiresOn="2027-04-10" />);
    await user.click(screen.getByRole("button", { name: "Perpanjang" }));
    const dialog = await screen.findByRole("dialog", { name: "Perpanjang paket" });
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Tanggal baru harus setelah 10 Apr 2027.");
    expect(extendPatientPackage).not.toHaveBeenCalled();
    setDateField("Berlaku sampai", "2027-05-10", within(dialog));
    await user.type(within(dialog).getByLabelText("Alasan"), "Customer sakit");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(extendPatientPackage).toHaveBeenCalledWith({ packageId: "pp1", expiresOn: "2027-05-10", reason: "Customer sakit" }));
  });
});

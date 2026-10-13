import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddPackageDialog } from "@/components/admin/billing/add-package-dialog";
import { addPackageLine } from "@/server/invoice-drafts";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-drafts", () => ({ addPackageLine: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const packages = [{ id: "p1", name: "Facial Glow 5x", price: 1_500_000, validDays: 180, contents: "5× Relaxing Facial" }];

beforeEach(() => vi.clearAllMocks());

describe("AddPackageDialog", () => {
  it("memilih paket menampilkan isinya lalu menambah baris", async () => {
    vi.mocked(addPackageLine).mockResolvedValue({ ok: true, data: { version: 3 } });
    const user = userEvent.setup();
    renderAdmin(<AddPackageDialog invoiceId="inv" version={2} packages={packages} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Jual paket" });
    await user.selectOptions(within(dialog).getByLabelText("Paket"), "p1");
    expect(dialog).toHaveTextContent("5× Relaxing Facial · berlaku 180 hari");
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(addPackageLine).toHaveBeenCalledWith({ invoiceId: "inv", version: 2, packageId: "p1" }));
  });

  it("tanpa paket aktif: memberi tahu dan tidak bisa menambah", async () => {
    const user = userEvent.setup();
    renderAdmin(<AddPackageDialog invoiceId="inv" version={2} packages={[]} />);
    await user.click(screen.getByRole("button", { name: "+ Paket" }));
    const dialog = await screen.findByRole("dialog", { name: "Jual paket" });
    expect(dialog).toHaveTextContent("Belum ada paket aktif. Minta Admin Keuangan menambahkannya di menu Paket.");
    expect(within(dialog).getByRole("button", { name: "Tambah" })).toBeDisabled();
  });
});

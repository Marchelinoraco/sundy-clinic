import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PurchasePriceDialog } from "@/components/admin/stock/purchase-price-dialog";
import { setPurchasePrices } from "@/server/purchase-pricing";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/purchase-pricing", () => ({ setPurchasePrices: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const lines = [
  { id: "l1", label: "Amoxicillin (batch B-01)", quantity: 10, unit: "kapsul", unitCost: null },
  { id: "l2", label: "Serum C", quantity: 2, unit: "botol", unitCost: null },
];

beforeEach(() => vi.clearAllMocks());

describe("PurchasePriceDialog", () => {
  it("mengisi harga semua baris, menampilkan total, lalu mengirim", async () => {
    vi.mocked(setPurchasePrices).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<PurchasePriceDialog invoiceId="pi1" lines={lines} />);
    await user.click(screen.getByRole("button", { name: "Isi harga beli" }));
    const dialog = await screen.findByRole("dialog", { name: "Isi harga beli" });
    await user.type(within(dialog).getByLabelText("Harga beli Amoxicillin (batch B-01)"), "5000");
    await user.type(within(dialog).getByLabelText("Harga beli Serum C"), "75000");
    expect(dialog).toHaveTextContent("Total faktur: Rp 200.000");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(setPurchasePrices).toHaveBeenCalledWith({
        invoiceId: "pi1",
        prices: [
          { lineId: "l1", unitCost: 5000 },
          { lineId: "l2", unitCost: 75_000 },
        ],
      }),
    );
  });

  it("baris kosong ditolak di layar", async () => {
    const user = userEvent.setup();
    renderAdmin(<PurchasePriceDialog invoiceId="pi1" lines={lines} />);
    await user.click(screen.getByRole("button", { name: "Isi harga beli" }));
    const dialog = await screen.findByRole("dialog", { name: "Isi harga beli" });
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Isi harga beli semua baris.");
    expect(setPurchasePrices).not.toHaveBeenCalled();
  });
});

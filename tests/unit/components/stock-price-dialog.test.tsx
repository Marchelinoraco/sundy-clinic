import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockPriceDialog } from "@/components/admin/stock/stock-price-dialog";
import { setStockItemPrice } from "@/server/stock-catalog";
import { setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/stock-catalog", () => ({ setStockItemPrice: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NO_PROMO = { promoName: null, promoKind: null, promoValue: 0, promoStartsOn: null, promoEndsOn: null };

beforeEach(() => vi.clearAllMocks());

describe("StockPriceDialog", () => {
  it("mengisi harga jual dan promo persen bertanggal", async () => {
    vi.mocked(setStockItemPrice).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<StockPriceDialog itemId="i1" itemName="Serum C" sellPrice={null} promo={NO_PROMO} />);
    await user.click(screen.getByRole("button", { name: "Harga & promo" }));
    const dialog = await screen.findByRole("dialog", { name: "Harga & promo Serum C" });
    await user.type(within(dialog).getByLabelText("Harga jual"), "150000");
    await user.selectOptions(within(dialog).getByLabelText("Promo"), "PERSEN");
    await user.type(within(dialog).getByLabelText("Nama promo"), "Promo Oktober");
    await user.type(within(dialog).getByLabelText("Persen promo"), "10");
    setDateField("Mulai", "2026-10-01", within(dialog));
    setDateField("Selesai", "2026-10-31", within(dialog));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(setStockItemPrice).toHaveBeenCalledWith({
        itemId: "i1",
        sellPrice: 150_000,
        promo: { name: "Promo Oktober", kind: "PERSEN", value: 10, startsOn: "2026-10-01", endsOn: "2026-10-31" },
      }),
    );
  });

  it("tanpa promo: isian promo tersembunyi dan dikirim kosong", async () => {
    vi.mocked(setStockItemPrice).mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderAdmin(<StockPriceDialog itemId="i1" itemName="Serum C" sellPrice={150_000} promo={{ ...NO_PROMO, promoName: "Lama", promoKind: "NOMINAL", promoValue: 5000 }} />);
    await user.click(screen.getByRole("button", { name: "Harga & promo" }));
    const dialog = await screen.findByRole("dialog", { name: "Harga & promo Serum C" });
    await user.selectOptions(within(dialog).getByLabelText("Promo"), "");
    expect(within(dialog).queryByLabelText("Nama promo")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(setStockItemPrice).toHaveBeenCalledWith({ itemId: "i1", sellPrice: 150_000, promo: { name: "", kind: null, value: 0, startsOn: "", endsOn: "" } }));
  });

  it("galat server tampil", async () => {
    vi.mocked(setStockItemPrice).mockResolvedValue({ ok: false, error: "Isi nama promo." });
    const user = userEvent.setup();
    renderAdmin(<StockPriceDialog itemId="i1" itemName="Serum C" sellPrice={1000} promo={NO_PROMO} />);
    await user.click(screen.getByRole("button", { name: "Harga & promo" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Harga & promo Serum C" })).getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Isi nama promo.");
  });
});

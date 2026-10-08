import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { createStockItem, updateStockItem } from "@/server/stock-catalog";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/stock-catalog", () => ({ createStockItem: vi.fn(), updateStockItem: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe("StockItemDialog", () => {
  it("menambah barang dengan isian formulir", async () => {
    const user = userEvent.setup();
    vi.mocked(createStockItem).mockResolvedValue({ ok: true, data: { id: "i9" } });
    renderAdmin(<StockItemDialog triggerLabel="+ Barang" />);
    await user.click(screen.getByRole("button", { name: "+ Barang" }));
    expect(screen.getByRole("dialog", { name: "Tambah barang" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Kode"), "obt-001");
    await user.type(screen.getByLabelText("Nama"), "Amoxicillin");
    await user.type(screen.getByLabelText("Satuan"), "kapsul");
    await user.clear(screen.getByLabelText("Batas menipis"));
    await user.type(screen.getByLabelText("Batas menipis"), "20");
    await user.type(screen.getByLabelText("Harga jual"), "2000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(createStockItem).toHaveBeenCalledWith({
        code: "obt-001",
        name: "Amoxicillin",
        kind: "OBAT",
        unit: "kapsul",
        sellPrice: 2000,
        minStock: 20,
        notes: "",
      }),
    );
  });

  it("galat isian tampil tanpa memanggil server; galat server juga tampil", async () => {
    const user = userEvent.setup();
    renderAdmin(<StockItemDialog triggerLabel="+ Barang" />);
    await user.click(screen.getByRole("button", { name: "+ Barang" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Isi kode barang.");
    expect(createStockItem).not.toHaveBeenCalled();

    vi.mocked(createStockItem).mockResolvedValue({ ok: false, error: "Kode barang OBT-001 sudah dipakai." });
    await user.type(screen.getByLabelText("Kode"), "OBT-001");
    await user.type(screen.getByLabelText("Nama"), "Amoxicillin");
    await user.type(screen.getByLabelText("Satuan"), "kapsul");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Kode barang OBT-001 sudah dipakai.")).toBeInTheDocument();
  });

  it("mengubah barang memanggil updateStockItem dengan id-nya", async () => {
    const user = userEvent.setup();
    vi.mocked(updateStockItem).mockResolvedValue({ ok: true, data: undefined });
    const initial = { code: "OBT-001", name: "Amoxicillin", kind: "OBAT" as const, unit: "kapsul", sellPrice: 2000, minStock: 20, notes: "" };
    renderAdmin(<StockItemDialog itemId="i1" initial={initial} triggerLabel="Ubah barang" />);
    await user.click(screen.getByRole("button", { name: "Ubah barang" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(updateStockItem).toHaveBeenCalledWith("i1", initial));
  });
});

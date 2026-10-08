import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseForm } from "@/components/admin/stock/purchase-form";
import { createPurchase } from "@/server/purchases";
import { createSupplier } from "@/server/stock-catalog";
import { dateFieldValue, pickOption, setDateField } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/purchases", () => ({ createPurchase: vi.fn() }));
vi.mock("@/server/stock-catalog", () => ({ createSupplier: vi.fn(), updateSupplier: vi.fn() }));

const items = [
  { id: "obat", code: "OBT-001", name: "Amoxicillin", unit: "kapsul", kind: "OBAT" as const },
  { id: "serum", code: "PRD-001", name: "Serum C", unit: "botol", kind: "PRODUK" as const },
];
const TODAY = "2026-10-07";

function renderForm() {
  return renderAdmin(
    <PurchaseForm items={items} suppliers={[{ id: "s1", name: "Kimia Farma" }]} branches={[{ id: "b1", name: "SunDY Mahakeret" }]} today={TODAY} />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("PurchaseForm", () => {
  it("menghitung total, mengirim faktur, lalu membuka detailnya", async () => {
    const user = userEvent.setup();
    vi.mocked(createPurchase).mockResolvedValue({ ok: true, data: { id: "p1" } });
    renderForm();
    await user.selectOptions(screen.getByLabelText("Supplier"), "s1");
    await user.type(screen.getByLabelText("Nomor faktur"), "INV-1");
    await pickOption(user, "Barang baris 1", "Amoxicillin (OBT-001)");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "10");
    await user.type(screen.getByLabelText("Harga beli baris 1"), "5000");
    await user.type(screen.getByLabelText("Batch baris 1"), "B1");
    setDateField("Kedaluwarsa baris 1", "2027-06-01");
    await user.click(screen.getByRole("button", { name: "+ Tambah baris" }));
    await pickOption(user, "Barang baris 2", "Serum C (PRD-001)");
    await user.type(screen.getByLabelText("Jumlah baris 2"), "2");
    await user.type(screen.getByLabelText("Harga beli baris 2"), "75000");
    expect(screen.getByText("Rp 200.000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan barang masuk" }));
    await waitFor(() =>
      expect(createPurchase).toHaveBeenCalledWith({
        supplierId: "s1",
        branchId: "b1",
        invoiceNumber: "INV-1",
        invoiceDate: "2026-10-07",
        dueDate: "2026-11-06",
        notes: "",
        lines: [
          { itemId: "obat", quantity: 10, unitCost: 5000, batchNumber: "B1", expiryDate: "2027-06-01" },
          { itemId: "serum", quantity: 2, unitCost: 75000, batchNumber: "", expiryDate: "" },
        ],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/stok/masuk/p1"));
  });

  it("obat tanpa kedaluwarsa ditolak di browser tanpa memanggil server", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.selectOptions(screen.getByLabelText("Supplier"), "s1");
    await user.type(screen.getByLabelText("Nomor faktur"), "INV-2");
    await pickOption(user, "Barang baris 1", "Amoxicillin (OBT-001)");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "1");
    await user.type(screen.getByLabelText("Harga beli baris 1"), "1000");
    await user.click(screen.getByRole("button", { name: "Simpan barang masuk" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Baris 1: isi tanggal kedaluwarsa obat.");
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it("jatuh tempo mengikuti tanggal faktur + 30 hari sampai diubah sendiri", () => {
    renderForm();
    setDateField("Tanggal faktur", "2026-10-01");
    expect(dateFieldValue("Jatuh tempo")).toBe("2026-10-31");
    setDateField("Jatuh tempo", "2026-11-15");
    setDateField("Tanggal faktur", "2026-10-02");
    expect(dateFieldValue("Jatuh tempo")).toBe("2026-11-15");
  });

  it("supplier baru dari dialog langsung terpilih", async () => {
    const user = userEvent.setup();
    vi.mocked(createSupplier).mockResolvedValue({ ok: true, data: { id: "s2", name: "Medika Jaya" } });
    renderForm();
    await user.click(screen.getByRole("button", { name: "+ Supplier baru" }));
    const dialog = screen.getByRole("dialog", { name: "Tambah supplier" });
    await user.type(within(dialog).getByLabelText("Nama supplier"), "Medika Jaya");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(screen.getByLabelText("Supplier")).toHaveValue("s2"));
  });
});

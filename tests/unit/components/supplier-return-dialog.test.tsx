import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierReturnDialog } from "@/components/admin/stock/supplier-return-dialog";
import { createSupplierReturn } from "@/server/stock-movements";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/stock-movements", () => ({ createSupplierReturn: vi.fn() }));

const lines = [
  { batchId: "b1", label: "Amoxicillin batch B1", remaining: 10, unitCost: 5000, unit: "kapsul" },
  { batchId: "b2", label: "Serum C batch -", remaining: 2, unitCost: 75000, unit: "botol" },
];

beforeEach(() => vi.clearAllMocks());

async function open() {
  const user = userEvent.setup();
  renderAdmin(<SupplierReturnDialog invoiceId="p1" lines={lines} />);
  await user.click(screen.getByRole("button", { name: "Retur ke supplier" }));
  return user;
}

describe("SupplierReturnDialog", () => {
  it("menghitung nilai retur dan mengirim baris yang diisi saja", async () => {
    vi.mocked(createSupplierReturn).mockResolvedValue({ ok: true, data: { id: "r1" } });
    const user = await open();
    await user.type(screen.getByLabelText("Jumlah retur Amoxicillin batch B1"), "2");
    expect(screen.getByText("Rp 10.000")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Catatan retur"), "Kemasan penyok");
    await user.click(screen.getByRole("button", { name: "Simpan retur" }));
    await waitFor(() =>
      expect(createSupplierReturn).toHaveBeenCalledWith({ invoiceId: "p1", lines: [{ batchId: "b1", quantity: 2 }], note: "Kemasan penyok" }),
    );
  });

  it("menolak jumlah melebihi sisa dan retur kosong", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Simpan retur" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pilih minimal satu barang untuk diretur.");
    await user.type(screen.getByLabelText("Jumlah retur Serum C batch -"), "3");
    await user.click(screen.getByRole("button", { name: "Simpan retur" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Jumlah retur Serum C batch - melebihi sisa (2 botol).");
    expect(createSupplierReturn).not.toHaveBeenCalled();
  });
});

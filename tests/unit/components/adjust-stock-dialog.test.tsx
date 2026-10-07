import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdjustStockDialog } from "@/components/admin/stock/adjust-stock-dialog";
import { adjustStock } from "@/server/stock-movements";

vi.mock("@/server/stock-movements", () => ({ adjustStock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const batch = { id: "b1", label: "Amoxicillin batch B-01", remaining: 5, unit: "kapsul" };

beforeEach(() => vi.clearAllMocks());

async function open() {
  const user = userEvent.setup();
  render(<AdjustStockDialog batch={batch} />);
  await user.click(screen.getByRole("button", { name: "Penyesuaian Amoxicillin batch B-01" }));
  return user;
}

describe("AdjustStockDialog", () => {
  it("mengurangi stok dengan alasan dan mengirimnya ke server", async () => {
    vi.mocked(adjustStock).mockResolvedValue({ ok: true, data: undefined });
    const user = await open();
    const options = within(screen.getByLabelText("Alasan")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Rusak", "Hilang", "Kedaluwarsa dibuang", "Lainnya"]);
    await user.type(screen.getByLabelText("Jumlah"), "2");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(adjustStock).toHaveBeenCalledWith({ batchId: "b1", direction: "KURANGI", quantity: 2, reason: "RUSAK", note: "" }),
    );
  });

  it("menambah hanya untuk selisih hitung dan wajib catatan", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Tambah" }));
    const options = within(screen.getByLabelText("Alasan")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Selisih hitung"]);
    await user.type(screen.getByLabelText("Jumlah"), "1");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Isi catatan untuk alasan ini.");
    expect(adjustStock).not.toHaveBeenCalled();
  });

  it("pengurangan melebihi sisa ditolak di browser", async () => {
    const user = await open();
    await user.type(screen.getByLabelText("Jumlah"), "6");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pengurangan melebihi sisa batch (5 kapsul).");
    expect(adjustStock).not.toHaveBeenCalled();
  });
});

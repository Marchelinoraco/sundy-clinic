import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestockRequestDialog } from "@/components/admin/counter/restock-request-dialog";
import { createRestockRequest } from "@/server/restock";
import type { CounterItemRow } from "@/server/counter-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/restock", () => ({ createRestockRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const item = (patch: Partial<CounterItemRow>): CounterItemRow => ({
  id: "i1", code: "AMX", name: "Amoxicillin", unit: "kapsul", kind: "OBAT", available: 0, expired: 0, counterMinStock: 5, flag: "MEJA_HABIS", requested: false, ...patch,
});
const OPTIONS = [
  item({}),
  item({ id: "i2", code: "VIT", name: "Vitamin C", unit: "tablet", available: 30, counterMinStock: 10, flag: null }),
  item({ id: "i3", code: "SRM", name: "Serum", unit: "botol", available: 1, counterMinStock: 2, flag: "MEJA_MENIPIS", requested: true }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createRestockRequest).mockResolvedValue({ ok: true, data: { id: "r1" } });
});

describe("RestockRequestDialog (spec stok meja 4.1)", { timeout: 15_000 }, () => {
  it("terisi barang yang menipis/habis dan belum diminta, dengan jumlah usulan; yang sudah diminta disebut", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockRequestDialog branchId="b1" options={OPTIONS} />);
    await user.click(screen.getByRole("button", { name: "Minta restock" }));
    const dialog = screen.getByRole("dialog", { name: "Minta restock" });
    expect(within(dialog).getByLabelText("Barang 1")).toHaveValue("Amoxicillin (AMX)");
    expect(within(dialog).getByLabelText("Jumlah 1")).toHaveValue(10);
    expect(within(dialog).queryByLabelText("Barang 2")).toBeNull();
    expect(dialog).toHaveTextContent("Sudah diminta: Serum");
    await user.type(within(dialog).getByLabelText("Catatan"), "untuk sore");
    await user.click(within(dialog).getByRole("button", { name: "Kirim permintaan" }));
    await waitFor(() =>
      expect(createRestockRequest).toHaveBeenCalledWith({ branchId: "b1", note: "untuk sore", lines: [{ itemId: "i1", quantity: 10 }] }),
    );
  });

  it("isian awal dari pemanggil (draf tagihan) dan validasi di layar", async () => {
    const user = userEvent.setup();
    renderAdmin(<RestockRequestDialog branchId="b1" options={OPTIONS} initial={[{ itemId: "i2", quantity: 4 }]} />);
    await user.click(screen.getByRole("button", { name: "Minta restock" }));
    const dialog = screen.getByRole("dialog", { name: "Minta restock" });
    expect(within(dialog).getByLabelText("Barang 1")).toHaveValue("Vitamin C (VIT)");
    await user.clear(within(dialog).getByLabelText("Jumlah 1"));
    await user.click(within(dialog).getByRole("button", { name: "Kirim permintaan" }));
    expect(await within(dialog).findByText("Jumlah restock harus bilangan bulat 1–9.999.")).toBeInTheDocument();
    expect(createRestockRequest).not.toHaveBeenCalled();
  });
});

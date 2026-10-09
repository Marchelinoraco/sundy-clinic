import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierTable } from "@/components/admin/stock/supplier-table";
import { updateSupplier } from "@/server/stock-catalog";
import type { SupplierRow } from "@/server/stock-read";
import { mockGridLayout } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/stock-catalog", () => ({ createSupplier: vi.fn(), updateSupplier: vi.fn(), setSupplierActive: vi.fn() }));

const row: SupplierRow = { id: "s1", name: "Kimia Farma", phone: "0431", address: "Manado", notes: null, isActive: true, balance: 50000 };

beforeEach(() => {
  vi.clearAllMocks();
  mockGridLayout();
});

describe("SupplierTable", () => {
  it("sisa hutang tampil untuk pemegang hak hutang", () => {
    renderAdmin(<SupplierTable rows={[row]} canManage={false} />);
    expect(screen.getByRole("gridcell", { name: "Rp 50.000" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ubah" })).toBeNull();
  });

  it("mengubah supplier dari tombol Ubah di barisnya: ketikan di dialog tidak ditangkap tabel", async () => {
    const user = userEvent.setup();
    vi.mocked(updateSupplier).mockResolvedValue({ ok: true, data: undefined });
    renderAdmin(<SupplierTable rows={[row]} canManage />);
    await user.click(screen.getByRole("button", { name: "Ubah" }));
    const dialog = await screen.findByRole("dialog", { name: "Ubah supplier" });
    const name = within(dialog).getByLabelText("Nama supplier");
    await user.clear(name);
    await user.type(name, "Kimia Farma Manado");
    const address = within(dialog).getByLabelText("Alamat");
    await user.type(address, "{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}Jl. Sam Ratulangi, ");
    expect(name).toHaveValue("Kimia Farma Manado");
    expect(address).toHaveValue("Jl. Sam Ratulangi, Manado");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(updateSupplier).toHaveBeenCalledWith("s1", { name: "Kimia Farma Manado", phone: "0431", address: "Jl. Sam Ratulangi, Manado", notes: "" }),
    );
  });
});

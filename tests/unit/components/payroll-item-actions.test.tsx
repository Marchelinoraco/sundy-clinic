import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollItemActions } from "@/components/admin/payroll/payroll-item-actions";
import { addPayrollAdjustment, payPayrollItem, voidPayrollPayment } from "@/server/payroll-actions";
import type { PayrollItemRow } from "@/server/payroll-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/payroll-actions", () => ({
  addPayrollAdjustment: vi.fn(),
  removePayrollAdjustment: vi.fn(),
  updatePayrollAmounts: vi.fn(),
  payPayrollItem: vi.fn(),
  voidPayrollPayment: vi.fn(),
  removePayrollItem: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ITEM: PayrollItemRow = {
  id: "i1", employeeId: "e1", employeeName: "Rina", position: "Terapis", staffId: "t1", baseSalary: 3_000_000, allowance: 500_000, amountNote: null,
  commission: 400_000, treatments: 8, bonusTotal: 0, deductionTotal: 200_000, total: 3_700_000, paidAt: null, paidByName: null,
  adjustments: [
    { id: "a1", kind: "POTONGAN", amount: 150_000, note: "Kasbon", automatic: false },
    { id: "a2", kind: "POTONGAN", amount: 50_000, note: "Koreksi komisi TG-2026-0009 (dibatalkan)", automatic: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [addPayrollAdjustment, payPayrollItem, voidPayrollPayment]) vi.mocked(fn).mockResolvedValue({ ok: true, data: undefined });
});

describe("PayrollItemActions (spec karyawan 4–5)", { timeout: 15_000 }, () => {
  it("penyesuaian: daftar bonus/potongan, koreksi otomatis tanpa tombol hapus, tambah potongan", async () => {
    const user = userEvent.setup();
    renderAdmin(<PayrollItemActions month="2026-10" item={ITEM} today="2026-10-31" />);
    await user.click(screen.getByRole("button", { name: "Penyesuaian Rina" }));
    const dialog = screen.getByRole("dialog", { name: "Penyesuaian — Rina" });
    expect(within(dialog).getByRole("button", { name: "Hapus Kasbon" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Hapus Koreksi komisi/ })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Jenis"), "BONUS");
    await user.type(within(dialog).getByLabelText("Nominal"), "300000");
    await user.type(within(dialog).getByLabelText("Keterangan"), "Bonus target");
    await user.click(within(dialog).getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(addPayrollAdjustment).toHaveBeenCalledWith({ itemId: "i1", kind: "BONUS", amount: 300_000, note: "Bonus target" }));
  });

  it("tandai dibayar menampilkan total dan memakai tanggal hari ini", async () => {
    const user = userEvent.setup();
    renderAdmin(<PayrollItemActions month="2026-10" item={ITEM} today="2026-10-31" />);
    await user.click(screen.getByRole("button", { name: "Tandai dibayar Rina" }));
    const dialog = screen.getByRole("dialog", { name: "Tandai dibayar — Rina" });
    expect(dialog).toHaveTextContent("Rp 3.700.000");
    await user.click(within(dialog).getByRole("button", { name: "Bayar" }));
    await waitFor(() => expect(payPayrollItem).toHaveBeenCalledWith({ itemId: "i1", paidOn: "2026-10-31" }));
  });

  it("baris dibayar hanya bisa dibatalkan, dengan alasan", async () => {
    const user = userEvent.setup();
    renderAdmin(<PayrollItemActions month="2026-10" item={{ ...ITEM, paidAt: "2026-10-31", paidByName: "Keuangan" }} today="2026-10-31" />);
    expect(screen.queryByRole("button", { name: "Tandai dibayar Rina" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Penyesuaian Rina" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Batalkan pembayaran Rina" }));
    const dialog = screen.getByRole("dialog", { name: "Batalkan pembayaran — Rina" });
    await user.type(within(dialog).getByLabelText("Alasan"), "Salah nominal");
    await user.click(within(dialog).getByRole("button", { name: "Batalkan pembayaran" }));
    await waitFor(() => expect(voidPayrollPayment).toHaveBeenCalledWith({ itemId: "i1", reason: "Salah nominal" }));
  });
});

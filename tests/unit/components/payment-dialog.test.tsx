import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentDialog } from "@/components/admin/stock/payment-dialog";
import { recordSupplierPayment } from "@/server/payables";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/payables", () => ({ recordSupplierPayment: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("PaymentDialog", () => {
  it("bawaannya melunasi sisa dengan transfer hari ini", async () => {
    const user = userEvent.setup();
    vi.mocked(recordSupplierPayment).mockResolvedValue({ ok: true, data: { id: "pay1" } });
    render(<PaymentDialog invoiceId="p1" kind="BAYAR" limit={60000} invoiceDate="2026-10-01" today="2026-10-07" />);
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(recordSupplierPayment).toHaveBeenCalledWith({
        invoiceId: "p1",
        kind: "BAYAR",
        amount: 60000,
        method: "TRANSFER",
        paidAt: "2026-10-07",
        reference: "",
      }),
    );
  });

  it("nominal di atas sisa ditolak di browser", async () => {
    const user = userEvent.setup();
    render(<PaymentDialog invoiceId="p1" kind="BAYAR" limit={60000} invoiceDate="2026-10-01" today="2026-10-07" />);
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    await user.clear(screen.getByLabelText("Nominal"));
    await user.type(screen.getByLabelText("Nominal"), "70000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nominal melebihi sisa hutang (Rp 60.000).");
    expect(recordSupplierPayment).not.toHaveBeenCalled();
  });

  it("pengembalian dana dari supplier memakai jenis PENGEMBALIAN", async () => {
    const user = userEvent.setup();
    vi.mocked(recordSupplierPayment).mockResolvedValue({ ok: true, data: { id: "pay2" } });
    render(<PaymentDialog invoiceId="p1" kind="PENGEMBALIAN" limit={30000} invoiceDate="2026-10-01" today="2026-10-07" />);
    await user.click(screen.getByRole("button", { name: "Catat pengembalian dana" }));
    await user.selectOptions(screen.getByLabelText("Metode"), "TUNAI");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(recordSupplierPayment).toHaveBeenCalledWith(expect.objectContaining({ kind: "PENGEMBALIAN", amount: 30000, method: "TUNAI" })),
    );
  });
});

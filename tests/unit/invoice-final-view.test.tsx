import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceFinalView } from "@/components/admin/billing/invoice-final-view";
import { InvoicePaymentDialog } from "@/components/admin/billing/invoice-payment-dialog";
import { invoiceTotals } from "@/lib/invoice";
import type { InvoiceDetail, InvoicePaymentRow } from "@/server/invoice-read";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  recordInvoicePayment: vi.fn(),
  revokeInvoicePayment: vi.fn(),
  applyFinalDiscount: vi.fn(),
  cancelInvoice: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/invoice-payments", () => ({
  recordInvoicePayment: mocks.recordInvoicePayment,
  revokeInvoicePayment: mocks.revokeInvoicePayment,
  applyFinalDiscount: mocks.applyFinalDiscount,
}));
vi.mock("@/server/invoice-lifecycle", () => ({ cancelInvoice: mocks.cancelInvoice, finalizeInvoice: vi.fn() }));

const payment: InvoicePaymentRow = {
  id: "pay1",
  amount: 40000,
  method: "TUNAI",
  paidAt: "2026-10-07",
  reference: "KW-1",
  staffName: "Resepsionis Uji",
  createdAt: new Date("2026-10-07T03:00:00Z"),
  revokedAt: null,
  revokedByName: null,
  revokeReason: null,
};

function finalDetail(patch: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const lines: InvoiceDetail["lines"] = [
    { id: "l1", kind: "LAYANAN", name: "Konsultasi Gizi", quantity: 1, unitPrice: 150000, amount: 150000, priceNote: null, serviceId: "s1", itemId: null, catalogLinked: true, fromDispensing: false, cost: null },
    { id: "l2", kind: "BARANG", name: "Vitamin C", quantity: 2, unitPrice: 25000, amount: 50000, priceNote: null, serviceId: null, itemId: "it1", catalogLinked: true, fromDispensing: false, cost: null },
  ];
  const payments = patch.payments ?? [payment];
  return {
    id: "inv1",
    number: "TG-2026-0001",
    status: "FINAL",
    version: 5,
    patient: { id: "p1", name: "Ani Uji", medicalRecordNumber: "RM-001" },
    branchId: "b1",
    branchName: "Manado",
    appointmentId: "a1",
    dispensing: null,
    visitDate: new Date("2026-10-07T03:00:00Z"),
    discountKind: null,
    discountValue: 0,
    discountReason: null,
    discountByName: null,
    totals: invoiceTotals({ status: "FINAL", discountKind: null, discountValue: 0, lines, payments }),
    notes: null,
    createdByName: "Resepsionis Uji",
    createdAt: new Date("2026-10-07T03:00:00Z"),
    finalizedAt: new Date("2026-10-07T03:10:00Z"),
    finalizedByName: "Resepsionis Uji",
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
    lines,
    payments,
    everPaid: payments.length > 0,
    cost: null,
    ...patch,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("tampilan tagihan final", () => {
  it("menampilkan baris, total, dibayar, sisa, dan riwayat pembayaran", () => {
    render(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    const summary = screen.getByRole("region", { name: "Ringkasan tagihan" });
    expect(summary).toHaveTextContent("Rp 200.000");
    expect(summary).toHaveTextContent("Rp 160.000");
    const payments = screen.getByRole("region", { name: "Pembayaran" });
    expect(payments).toHaveTextContent("Tunai");
    expect(payments).toHaveTextContent("KW-1");
  });

  it("resepsionis: bisa mencatat pembayaran, tidak bisa membatalkan pembayaran atau memberi diskon", () => {
    render(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    expect(screen.getByRole("button", { name: "Catat pembayaran" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Batalkan pembayaran/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tambah diskon" })).toBeNull();
  });

  it("Admin Keuangan: membatalkan pembayaran, menambah diskon, membatalkan tagihan; tidak mencatat pembayaran", () => {
    render(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage={false} canCorrect canSeeCost={false} />);
    expect(screen.queryByRole("button", { name: "Catat pembayaran" })).toBeNull();
    expect(screen.getByRole("button", { name: /Batalkan pembayaran/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah diskon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batalkan tagihan" })).toBeInTheDocument();
  });

  it("tagihan lunas atau dibatalkan tidak menawarkan pembayaran; pembayaran dibatalkan ditandai", () => {
    const paid = finalDetail({ payments: [{ ...payment, amount: 200000 }] });
    render(<InvoiceFinalView detail={paid} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    expect(screen.queryByRole("button", { name: "Catat pembayaran" })).toBeNull();
  });

  it("harga pokok hanya tampil bila diizinkan", () => {
    const withCost = finalDetail({ cost: 30000 });
    const { rerender } = render(<InvoiceFinalView detail={withCost} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    expect(screen.queryByText(/Harga pokok/)).toBeNull();
    rerender(<InvoiceFinalView detail={withCost} today="2026-10-07" canManage canCorrect={false} canSeeCost />);
    expect(screen.getByText(/Harga pokok/)).toBeInTheDocument();
  });

  it("dialog pembayaran: nominal di atas sisa ditolak di layar; yang sah dikirim", async () => {
    mocks.recordInvoicePayment.mockResolvedValue({ ok: true, data: { id: "pay2" } });
    render(<InvoicePaymentDialog invoiceId="inv1" limit={160000} finalizedDate="2026-10-07" today="2026-10-07" />);
    await userEvent.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText("Nominal");
    await userEvent.clear(amount);
    await userEvent.type(amount, "170000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nominal melebihi sisa tagihan");
    expect(mocks.recordInvoicePayment).not.toHaveBeenCalled();
    await userEvent.clear(amount);
    await userEvent.type(amount, "160000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(mocks.recordInvoicePayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: "inv1", amount: 160000, method: "TUNAI" })));
  });
});

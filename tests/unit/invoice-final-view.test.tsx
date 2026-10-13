import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceFinalView } from "@/components/admin/billing/invoice-final-view";
import { InvoicePaymentDialog } from "@/components/admin/billing/invoice-payment-dialog";
import { invoiceTotals } from "@/lib/invoice";
import type { InvoiceDetail, InvoicePaymentRow } from "@/server/invoice-read";
import { RECEIPT } from "../fixtures/receipt";
import { renderAdmin } from "./helpers/render-admin";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  recordInvoicePayment: vi.fn(),
  revokeInvoicePayment: vi.fn(),
  applyFinalDiscount: vi.fn(),
  cancelInvoice: vi.fn(),
}));
vi.mock("@/server/invoice-notes", () => ({ updateInvoiceNotes: vi.fn() }));
vi.mock("@/server/invoice-drafts", () => ({ setLineDiscount: vi.fn(), clearLineDiscount: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/invoice-payments", () => ({
  recordInvoicePayment: mocks.recordInvoicePayment,
  revokeInvoicePayment: mocks.revokeInvoicePayment,
  applyFinalDiscount: mocks.applyFinalDiscount,
}));
vi.mock("@/server/invoice-lifecycle", () => ({ cancelInvoice: mocks.cancelInvoice, finalizeInvoice: vi.fn() }));
vi.mock("@/server/receipt", () => ({ getReceiptMessage: vi.fn(), resetReceiptLink: vi.fn(), recordReceiptPrint: vi.fn() }));
vi.mock("@/components/admin/billing/receipt-printer", () => ({
  loadPrinterSettings: vi.fn(() => null),
  savePrinterSettings: vi.fn(),
  listPrinters: vi.fn(async () => []),
  printRaw: vi.fn(),
  PrinterError: class extends Error {},
}));

const payment: InvoicePaymentRow = {
  id: "pay1",
  amount: 40000,
  method: "TUNAI",
  paidAt: "2026-10-07",
  reference: "KW-1",
  destinationLabel: null,
  senderBank: null,
  senderAccountName: null,
  senderAccountNumber: null,
  staffName: "Resepsionis Uji",
  createdAt: new Date("2026-10-07T03:00:00Z"),
  revokedAt: null,
  revokedByName: null,
  revokeReason: null,
};

function finalDetail(patch: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const lines: InvoiceDetail["lines"] = [
    { id: "l1", kind: "LAYANAN", name: "Konsultasi Gizi", quantity: 1, unitPrice: 150000, gross: 150000, amount: 150000, discountAmount: 0, discountReason: null, discountSource: null, priceNote: null, serviceId: "s1", itemId: null, catalogLinked: true, fromDispensing: false, cost: null },
    { id: "l2", kind: "BARANG", name: "Vitamin C", quantity: 2, unitPrice: 25000, gross: 50000, amount: 50000, discountAmount: 0, discountReason: null, discountSource: null, priceNote: null, serviceId: null, itemId: "it1", catalogLinked: true, fromDispensing: false, cost: null },
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
    renderAdmin(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    const summary = screen.getByRole("region", { name: "Ringkasan tagihan" });
    expect(summary).toHaveTextContent("Rp 200.000");
    expect(summary).toHaveTextContent("Rp 160.000");
    const payments = screen.getByRole("region", { name: "Pembayaran" });
    expect(payments).toHaveTextContent("Tunai");
    expect(payments).toHaveTextContent("KW-1");
  });

  it("resepsionis: bisa mencatat pembayaran, tidak bisa membatalkan pembayaran atau memberi diskon", () => {
    renderAdmin(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    expect(screen.getByRole("button", { name: "Catat pembayaran" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Batalkan pembayaran/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tambah diskon" })).toBeNull();
  });

  it("Admin Keuangan: membatalkan pembayaran, menambah diskon, membatalkan tagihan; tidak mencatat pembayaran", () => {
    renderAdmin(<InvoiceFinalView detail={finalDetail()} today="2026-10-07" canManage={false} canCorrect canSeeCost={false} />);
    expect(screen.queryByRole("button", { name: "Catat pembayaran" })).toBeNull();
    expect(screen.getByRole("button", { name: /Batalkan pembayaran/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah diskon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batalkan tagihan" })).toBeInTheDocument();
  });

  it("tagihan lunas atau dibatalkan tidak menawarkan pembayaran; pembayaran dibatalkan ditandai", () => {
    const paid = finalDetail({ payments: [{ ...payment, amount: 200000 }] });
    renderAdmin(<InvoiceFinalView detail={paid} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    expect(screen.queryByRole("button", { name: "Catat pembayaran" })).toBeNull();
  });

  it("harga pokok hanya tampil bila diizinkan", () => {
    const withCost = finalDetail({ cost: 30000 });
    const { rerender } = renderAdmin(<InvoiceFinalView detail={withCost} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    expect(screen.queryByText(/Harga pokok/)).toBeNull();
    rerender(<InvoiceFinalView detail={withCost} today="2026-10-07" canManage canCorrect={false} canSeeCost />);
    expect(screen.getByText(/Harga pokok/)).toBeInTheDocument();
  });

  it("dialog pembayaran: nominal di atas sisa ditolak di layar; yang sah dikirim", async () => {
    mocks.recordInvoicePayment.mockResolvedValue({ ok: true, data: { id: "pay2" } });
    renderAdmin(<InvoicePaymentDialog invoiceId="inv1" limit={160000} finalizedDate="2026-10-07" today="2026-10-07" bankAccounts={[]} />);
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

  it("tagihan final + invoice:manage: Kirim struk via WA dan Ganti tautan; struk khusus cetak terpasang", () => {
    const { container } = renderAdmin(
      <InvoiceFinalView detail={finalDetail()} receipt={RECEIPT} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />,
    );
    expect(screen.getByRole("button", { name: "Kirim struk via WA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ganti tautan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cetak struk" })).toBeInTheDocument();
    expect(container.querySelector(".struk-hanya-cetak")).not.toBeNull();
    expect(container.querySelector(".struk-tanpa-cetak")).not.toBeNull();
  });

  it("tanpa invoice:manage tidak ada aksi struk", () => {
    renderAdmin(<InvoiceFinalView detail={finalDetail()} receipt={RECEIPT} today="2026-10-07" canManage={false} canCorrect canSeeCost={false} />);
    expect(screen.queryByRole("button", { name: "Kirim struk via WA" })).not.toBeInTheDocument();
  });

  it("tagihan dibatalkan (tanpa struk): isi halaman tetap tercetak, tidak disembunyikan", () => {
    const cancelled = finalDetail({ status: "DIBATALKAN", cancelledAt: new Date("2026-10-08T03:00:00Z"), cancelledByName: "Keuangan", cancelReason: "Salah input" });
    const { container } = renderAdmin(<InvoiceFinalView detail={cancelled} receipt={null} today="2026-10-07" canManage canCorrect canSeeCost={false} />);
    expect(container.querySelector(".struk-tanpa-cetak")).toBeNull();
    expect(container.querySelector(".struk-hanya-cetak")).toBeNull();
  });

  it("baris berdiskon: catatan promo, harga kotor dicoret, ringkasan memisahkan Diskon item", () => {
    const base = finalDetail();
    const lines: InvoiceDetail["lines"] = [
      base.lines[0],
      { ...base.lines[1], discountAmount: 5000, amount: 45000, discountReason: "Promo: Oktober", discountSource: "PROMO" },
    ];
    const detail = finalDetail({ lines, totals: invoiceTotals({ status: "FINAL", discountKind: null, discountValue: 0, lines, payments: [payment] }) });
    renderAdmin(<InvoiceFinalView detail={detail} today="2026-10-07" canManage canCorrect={false} canSeeCost={false} />);
    const summary = screen.getByRole("region", { name: "Ringkasan tagihan" });
    expect(summary).toHaveTextContent("SubtotalRp 200.000");
    expect(summary).toHaveTextContent("Diskon item-Rp 5.000");
    expect(summary).toHaveTextContent("TotalRp 195.000");
    expect(screen.getByText(/Diskon −Rp 5\.000 · Promo: Oktober/)).toBeInTheDocument();
    expect(screen.getByText("Rp 50.000")).toHaveStyle({ textDecoration: "line-through" });
  });
});

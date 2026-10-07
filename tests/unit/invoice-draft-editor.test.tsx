import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDraftEditor } from "@/components/admin/billing/invoice-draft-editor";
import { invoiceTotals } from "@/lib/invoice";
import type { InvoiceDetail } from "@/server/invoice-read";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  updateInvoiceLine: vi.fn(),
  removeInvoiceLine: vi.fn(),
  setInvoiceDiscount: vi.fn(),
  finalizeInvoice: vi.fn(),
  addInvoiceItem: vi.fn(),
  addFreeLine: vi.fn(),
  refreshCatalogPrices: vi.fn(),
  cancelInvoice: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/invoice-drafts", () => ({
  updateInvoiceLine: mocks.updateInvoiceLine,
  removeInvoiceLine: mocks.removeInvoiceLine,
  setInvoiceDiscount: mocks.setInvoiceDiscount,
  addInvoiceItem: mocks.addInvoiceItem,
  addFreeLine: mocks.addFreeLine,
  refreshCatalogPrices: mocks.refreshCatalogPrices,
}));
vi.mock("@/server/invoice-lifecycle", () => ({ finalizeInvoice: mocks.finalizeInvoice, cancelInvoice: mocks.cancelInvoice }));

function detail(patch: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const lines: InvoiceDetail["lines"] = [
    { id: "l1", kind: "LAYANAN", name: "Konsultasi Gizi", quantity: 1, unitPrice: 150000, amount: 150000, priceNote: null, serviceId: "s1", itemId: null, catalogLinked: true, fromDispensing: false, cost: null },
    { id: "l2", kind: "BARANG", name: "Vitamin C", quantity: 2, unitPrice: 25000, amount: 50000, priceNote: null, serviceId: null, itemId: "it1", catalogLinked: true, fromDispensing: false, cost: null },
  ];
  const base = { status: "DRAF" as const, discountKind: null, discountValue: 0, lines, payments: [] };
  return {
    id: "inv1",
    number: null,
    status: "DRAF",
    version: 3,
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
    totals: invoiceTotals(base),
    notes: null,
    createdByName: "Resepsionis Uji",
    createdAt: new Date("2026-10-07T03:00:00Z"),
    finalizedAt: null,
    finalizedByName: null,
    cancelledAt: null,
    cancelledByName: null,
    cancelReason: null,
    lines,
    payments: [],
    everPaid: false,
    cost: null,
    ...patch,
  };
}

const items = [{ id: "it1", code: "VIT-C", name: "Vitamin C", unit: "tablet", sellPrice: 25000, available: 40 }];

beforeEach(() => vi.clearAllMocks());

describe("editor draf tagihan", () => {
  it("menampilkan baris, subtotal, dan total", () => {
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    expect(screen.getByText("Konsultasi Gizi")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ringkasan tagihan" })).toHaveTextContent("Rp 200.000");
  });

  it("menyimpan perubahan jumlah dengan nomor versi tagihan", async () => {
    mocks.updateInvoiceLine.mockResolvedValue({ ok: true, data: { version: 4 } });
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    const qty = screen.getByLabelText("Jumlah Vitamin C");
    await userEvent.clear(qty);
    await userEvent.type(qty, "3");
    await userEvent.click(screen.getByRole("button", { name: "Simpan baris Vitamin C" }));
    await waitFor(() =>
      expect(mocks.updateInvoiceLine).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3, lineId: "l2", quantity: 3, unitPrice: 25000, priceNote: "" }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("harga katalog yang diubah tanpa catatan ditolak di layar sebelum dikirim", async () => {
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    const price = screen.getByLabelText("Harga Konsultasi Gizi");
    await userEvent.clear(price);
    await userEvent.type(price, "100000");
    await userEvent.click(screen.getByRole("button", { name: "Simpan baris Konsultasi Gizi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/catatan/i);
    expect(mocks.updateInvoiceLine).not.toHaveBeenCalled();
  });

  it("pesan versi usang dari server ditampilkan", async () => {
    mocks.removeInvoiceLine.mockResolvedValue({ ok: false, error: "Tagihan ini baru diubah orang lain. Muat ulang halaman." });
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Hapus Vitamin C" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Muat ulang halaman");
  });

  it("diskon resepsionis di atas 20% ditolak di layar; Admin Keuangan boleh", async () => {
    mocks.setInvoiceDiscount.mockResolvedValue({ ok: true, data: { version: 4 } });
    const { unmount } = render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.selectOptions(screen.getByLabelText("Jenis diskon"), "PERSEN");
    await userEvent.type(screen.getByLabelText("Nilai diskon"), "30");
    await userEvent.type(screen.getByLabelText("Alasan diskon"), "Kompensasi");
    await userEvent.click(screen.getByRole("button", { name: "Terapkan diskon" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/20%/);
    expect(mocks.setInvoiceDiscount).not.toHaveBeenCalled();
    unmount();

    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount />);
    await userEvent.selectOptions(screen.getByLabelText("Jenis diskon"), "PERSEN");
    await userEvent.type(screen.getByLabelText("Nilai diskon"), "30");
    await userEvent.type(screen.getByLabelText("Alasan diskon"), "Kompensasi");
    await userEvent.click(screen.getByRole("button", { name: "Terapkan diskon" }));
    await waitFor(() =>
      expect(mocks.setInvoiceDiscount).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3, kind: "PERSEN", value: 30, reason: "Kompensasi" }),
    );
  });

  it("finalkan: konfirmasi dulu, lalu memanggil server dengan versi", async () => {
    mocks.finalizeInvoice.mockResolvedValue({ ok: true, data: { number: "TG-2026-0001" } });
    render(<InvoiceDraftEditor detail={detail()} items={items} canExceedDiscount={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Finalkan tagihan" }));
    const dialog = await screen.findByRole("dialog", { name: "Finalkan tagihan?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Finalkan" }));
    await waitFor(() => expect(mocks.finalizeInvoice).toHaveBeenCalledWith({ invoiceId: "inv1", version: 3 }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("tagihan tanpa baris tidak bisa difinalkan", () => {
    const empty = detail({ lines: [], totals: invoiceTotals({ status: "DRAF", discountKind: null, discountValue: 0, lines: [], payments: [] }) });
    render(<InvoiceDraftEditor detail={empty} items={items} canExceedDiscount={false} />);
    expect(screen.getByRole("button", { name: "Finalkan tagihan" })).toBeDisabled();
  });
});

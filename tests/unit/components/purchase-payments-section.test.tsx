import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PurchasePaymentsSection } from "@/components/admin/stock/purchase-payments-section";
import type { PayableSummary } from "@/lib/stock";
import type { SupplierPaymentRow } from "@/server/purchase-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/payables", () => ({ recordSupplierPayment: vi.fn(), revokeSupplierPayment: vi.fn(), updateDueDate: vi.fn() }));

const payment = (patch: Partial<SupplierPaymentRow> = {}): SupplierPaymentRow => ({
  id: "pay1",
  kind: "BAYAR",
  amount: 40000,
  method: "TRANSFER",
  paidAt: "2026-10-07",
  reference: "TRF-1",
  staffName: "Rina",
  createdAt: new Date("2026-10-07T02:00:00Z"),
  revokedAt: null,
  revokedByName: null,
  revokeReason: null,
  ...patch,
});
const summary = (patch: Partial<PayableSummary>): PayableSummary => ({
  paid: 40000,
  refunded: 0,
  returned: 0,
  balance: 60000,
  status: "SEBAGIAN",
  overdue: false,
  ...patch,
});
const props = { invoiceId: "p1", invoiceDate: "2026-10-01", dueDate: "2026-10-31", today: "2026-10-07", total: 100000 };

describe("PurchasePaymentsSection", () => {
  it("sisa hutang: tombol bayar dan ubah jatuh tempo; pembayaran aktif bisa dibatalkan", () => {
    renderAdmin(<PurchasePaymentsSection {...props} summary={summary({})} payments={[payment()]} cancelled={false} />);
    const region = screen.getByRole("region", { name: "Pembayaran" });
    expect(within(region).getByText("Sisa hutang").nextElementSibling).toHaveTextContent("Rp 60.000");
    expect(within(region).getByRole("button", { name: "Catat pembayaran" })).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: "Catat pengembalian dana" })).not.toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Ubah jatuh tempo" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Batalkan pembayaran 7 Okt 2026 Rp 40.000" })).toBeInTheDocument();
    expect(within(region).getByText(/TRF-1/)).toBeInTheDocument();
  });

  it("kredit dari supplier: tombol pengembalian dana; pembayaran dibatalkan ditandai beserta alasannya", () => {
    renderAdmin(
      <PurchasePaymentsSection
        {...props}
        summary={summary({ paid: 100000, returned: 30000, balance: -30000, status: "KREDIT" })}
        payments={[payment({ amount: 100000 }), payment({ id: "pay0", revokedAt: new Date(), revokedByName: "Rina", revokeReason: "Nominal salah" })]}
        cancelled={false}
      />,
    );
    expect(screen.getByText("Kredit dari supplier").nextElementSibling).toHaveTextContent("Rp 30.000");
    expect(screen.getByRole("button", { name: "Catat pengembalian dana" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catat pembayaran" })).not.toBeInTheDocument();
    expect(screen.getByText("Dibatalkan Rina: Nominal salah")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Batalkan pembayaran/ })).toHaveLength(1);
  });

  it("faktur dibatalkan: tanpa tombol aksi", () => {
    renderAdmin(<PurchasePaymentsSection {...props} summary={summary({ status: "DIBATALKAN" })} payments={[]} cancelled />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Belum ada pembayaran.")).toBeInTheDocument();
  });
});

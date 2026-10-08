import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PayableTable } from "@/components/admin/stock/payable-table";
import type { PayableRow } from "@/server/payable-read";
import { renderAdmin } from "../helpers/render-admin";
import { mockGridLayout } from "../helpers/mui";

const row = (patch: Partial<PayableRow> = {}): PayableRow => ({
  id: "p1",
  supplierId: "s1",
  supplierName: "Kimia Farma",
  branchName: "SunDY Mahakeret",
  invoiceNumber: "INV-1",
  invoiceDate: "2026-09-01",
  dueDate: "2026-10-01",
  total: 100000,
  paid: 40000,
  returned: 0,
  refunded: 0,
  balance: 60000,
  status: "SEBAGIAN",
  overdue: true,
  ...patch,
});

beforeEach(() => mockGridLayout());

describe("PayableTable", () => {
  it("tautan ke faktur, sisa hutang, dan tanda terlambat", () => {
    renderAdmin(<PayableTable rows={[row()]} />);
    expect(screen.getByRole("link", { name: "INV-1" })).toHaveAttribute("href", "/admin/stok/masuk/p1");
    expect(screen.getByText("Rp 60.000")).toBeInTheDocument();
    expect(screen.getByText("Terlambat")).toBeInTheDocument();
    expect(screen.getByText("Kimia Farma")).toBeInTheDocument();
  });

  it("kredit dari supplier ditulis sebagai kredit; daftar kosong", () => {
    const { unmount } = renderAdmin(<PayableTable rows={[row({ balance: -30000, status: "KREDIT", overdue: false })]} />);
    expect(screen.getByText("Kredit Rp 30.000")).toBeInTheDocument();
    unmount();
    renderAdmin(<PayableTable rows={[]} />);
    expect(screen.getByText("Tidak ada faktur di tampilan ini.")).toBeInTheDocument();
  });
});

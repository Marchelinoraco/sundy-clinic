import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StockItemTable } from "@/components/admin/stock/stock-item-table";
import type { StockItemRow } from "@/server/stock-read";
import { renderAdmin } from "../helpers/render-admin";
import { mockGridLayout } from "../helpers/mui";

const row = (patch: Partial<StockItemRow> = {}): StockItemRow => ({
  id: "i1",
  code: "OBT-001",
  name: "Amoxicillin 500 mg",
  kind: "OBAT",
  unit: "kapsul",
  sellPrice: 2000,
  minStock: 20,
  isActive: true,
  onHand: 11,
  available: 8,
  value: 16500,
  low: true,
  expiringSoon: false,
  expired: true,
  flags: ["MENIPIS", "KEDALUWARSA"],
  ...patch,
});

beforeEach(() => mockGridLayout());

describe("StockItemTable", () => {
  it("menampilkan stok tersedia, sisa kedaluwarsa, tanda, harga, dan tautan detail", () => {
    renderAdmin(<StockItemTable rows={[row()]} />);
    expect(screen.getByRole("link", { name: "Amoxicillin 500 mg" })).toHaveAttribute("href", "/admin/stok/barang/i1");
    expect(screen.getByText("8 kapsul")).toBeInTheDocument();
    expect(screen.getByText("3 kedaluwarsa")).toBeInTheDocument();
    expect(screen.getByText("Menipis")).toBeInTheDocument();
    expect(screen.getByText("Kedaluwarsa")).toBeInTheDocument();
    expect(screen.getByText("Rp 2.000")).toBeInTheDocument();
  });

  it("harga kosong tampil sebagai tanda pisah; barang nonaktif diberi tanda; daftar kosong", () => {
    const { unmount } = renderAdmin(<StockItemTable rows={[row({ sellPrice: null, isActive: false, flags: [], onHand: 8 })]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Nonaktif")).toBeInTheDocument();
    unmount();
    renderAdmin(<StockItemTable rows={[]} />);
    expect(screen.getByText("Tidak ada barang yang cocok.")).toBeInTheDocument();
  });
});

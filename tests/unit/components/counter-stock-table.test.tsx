import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CounterStockTable } from "@/components/admin/counter/counter-stock-table";
import type { CounterItemRow } from "@/server/counter-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/counter-stock", () => ({ moveToCounter: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const row = (patch: Partial<CounterItemRow> = {}): CounterItemRow => ({
  id: "i1",
  code: "AMX",
  name: "Amoxicillin",
  unit: "kapsul",
  kind: "OBAT",
  available: 3,
  expired: 2,
  counterMinStock: 5,
  flag: "MEJA_MENIPIS",
  requested: true,
  ...patch,
});

describe("CounterStockTable (spec stok meja 4.1)", () => {
  it("menampilkan meja, kedaluwarsa di meja, Batas meja, tanda, dan Sudah diminta; tanpa harga", () => {
    renderAdmin(<CounterStockTable rows={[row()]} branchId="b1" branchName="Mahakeret" canFill={false} />);
    const table = screen.getByRole("table", { name: "Stok meja" });
    const r = within(table).getByRole("row", { name: /Amoxicillin/ });
    expect(r).toHaveTextContent("3 kapsul");
    expect(r).toHaveTextContent("2 kedaluwarsa di meja");
    expect(r).toHaveTextContent("Meja menipis");
    expect(r).toHaveTextContent("Sudah diminta");
    expect(table).not.toHaveTextContent("Rp");
    expect(screen.queryByRole("button", { name: /Isi meja/ })).toBeNull();
  });

  it("Apoteker mendapat tombol Isi meja per barang", () => {
    renderAdmin(<CounterStockTable rows={[row({ flag: "MEJA_HABIS", available: 0, requested: false })]} branchId="b1" branchName="Mahakeret" canFill />);
    expect(screen.getByRole("button", { name: "Isi meja Amoxicillin" })).toBeInTheDocument();
    expect(screen.getByText("Meja habis")).toBeInTheDocument();
  });
});

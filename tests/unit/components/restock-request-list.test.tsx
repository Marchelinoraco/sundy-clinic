import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RestockRequestList } from "@/components/admin/counter/restock-request-list";
import type { RestockRequestRow } from "@/server/restock-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/restock", () => ({ cancelRestockRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const row = (patch: Partial<RestockRequestRow> = {}): RestockRequestRow => ({
  id: "r1",
  status: "MENUNGGU",
  version: 1,
  branchId: "b1",
  branchName: "Mahakeret",
  note: null,
  requestedByName: "Rina",
  createdAt: new Date("2026-10-14T02:00:00Z"),
  decidedByName: null,
  decidedAt: null,
  rejectReason: null,
  lines: [{ id: "l1", itemId: "i1", itemName: "Amoxicillin", unit: "kapsul", requestedQuantity: 10, sentQuantity: null }],
  ...patch,
});

describe("RestockRequestList (spec stok meja 4)", () => {
  it("menunggu: barang diminta, tombol Batalkan untuk peminta, Proses untuk Apoteker", () => {
    renderAdmin(<RestockRequestList rows={[row()]} canCancel linkToDetail />);
    expect(screen.getByText("Amoxicillin: diminta 10 kapsul")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Batalkan permintaan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Proses" })).toHaveAttribute("href", "/admin/stok/permintaan/r1");
  });

  it("selesai dan ditolak: jumlah kirim, pemutus, alasan; tanpa tombol", () => {
    renderAdmin(
      <RestockRequestList
        rows={[
          row({ id: "r2", status: "SELESAI", decidedByName: "Apoteker Uji", decidedAt: new Date(), lines: [{ id: "l2", itemId: "i1", itemName: "Amoxicillin", unit: "kapsul", requestedQuantity: 10, sentQuantity: 6 }] }),
          row({ id: "r3", status: "DITOLAK", decidedByName: "Apoteker Uji", decidedAt: new Date(), rejectReason: "Stok kosong" }),
        ]}
        canCancel
        linkToDetail
      />,
    );
    expect(screen.getByText("Amoxicillin: diminta 10 kapsul · dikirim 6 kapsul")).toBeInTheDocument();
    expect(screen.getByText("Ditolak Apoteker Uji: Stok kosong")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Batalkan permintaan" })).toBeNull();
  });

  it("kosong", () => {
    renderAdmin(<RestockRequestList rows={[]} canCancel={false} linkToDetail={false} />);
    expect(screen.getByText("Belum ada permintaan.")).toBeInTheDocument();
  });
});

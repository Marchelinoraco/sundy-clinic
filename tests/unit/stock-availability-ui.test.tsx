import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isNavItemVisible, NAV_GROUPS } from "@/components/admin/app-sidebar";
import { StockAvailabilityTable } from "@/components/admin/dispensing/stock-availability-table";

const titlesFor = (role: Parameters<typeof isNavItemVisible>[0]) =>
  NAV_GROUPS.flatMap((group) => group.items).filter((item) => isNavItemVisible(role, item)).map((item) => item.title);

describe("tabel ketersediaan stok", () => {
  it("menampilkan nama, jenis, sisa, satuan; Habis ditandai; tanpa harga", () => {
    render(
      <StockAvailabilityTable
        rows={[
          { id: "a", name: "Amoxicillin", kind: "OBAT", unit: "kapsul", available: 9 },
          { id: "b", name: "Serum C", kind: "PRODUK", unit: "botol", available: 0 },
        ]}
      />,
    );
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText("9 kapsul")).toBeInTheDocument();
    expect(screen.getByText("Habis")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Rp");
  });

  it("kosong menampilkan keterangan", () => {
    render(<StockAvailabilityTable rows={[]} />);
    expect(screen.getByText("Tidak ada barang yang cocok.")).toBeInTheDocument();
  });
});

describe("menu stok per peran", () => {
  it("Dokter melihat Stok obat, bukan Stok; Apoteker dan Super Admin melihat Stok dan Resep, bukan Stok obat", () => {
    expect(titlesFor("DOKTER")).toContain("Stok obat");
    expect(titlesFor("DOKTER")).not.toContain("Stok");
    expect(titlesFor("DOKTER")).not.toContain("Resep");
    for (const role of ["APOTEKER", "SUPER_ADMIN"] as const) {
      expect(titlesFor(role)).toContain("Stok");
      expect(titlesFor(role)).toContain("Resep");
      expect(titlesFor(role)).not.toContain("Stok obat");
    }
  });

  it("Resepsionis dan Admin Keuangan tidak melihat Resep maupun Stok obat", () => {
    for (const role of ["RESEPSIONIS", "ADMIN_KEUANGAN"] as const) {
      expect(titlesFor(role)).not.toContain("Resep");
      expect(titlesFor(role)).not.toContain("Stok obat");
    }
  });
});

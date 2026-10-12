import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { RECEIPT } from "../../fixtures/receipt";


describe("ReceiptPaper", () => {
  it("memuat semua bagian struk", () => {
    render(<ReceiptPaper receipt={RECEIPT} />);
    const paper = screen.getByRole("region", { name: "Struk TG-2026-0123" });
    for (const text of ["SunDY Clinic", "SunDY Mahakeret", "Jl. Mahakeret 1, Manado", "12 Okt 2026 pukul 18.46", "Mey", "Priscillya Jenitha", "Paket Lux", "2 x Rp 750.000", "Rp 1.500.000", "-Rp 100.000", "Rp 1.400.000", "QRIS", "Rp 400.000", "DIBAYAR SEBAGIAN"]) {
      expect(paper, text).toHaveTextContent(text);
    }
    expect(within(paper).getByRole("list", { name: "Item" }).children).toHaveLength(1);
  });

  it("tanpa diskon dan lunas: tidak ada baris diskon dan sisa", () => {
    render(<ReceiptPaper receipt={{ ...RECEIPT, discount: 0, total: 1_500_000, paid: 1_500_000, balance: 0, status: "LUNAS" }} />);
    const paper = screen.getByRole("region", { name: "Struk TG-2026-0123" });
    expect(paper).not.toHaveTextContent("Diskon");
    expect(paper).not.toHaveTextContent("Sisa");
    expect(paper).toHaveTextContent("LUNAS");
  });

  it("kelas tambahan ikut terpasang", () => {
    render(<ReceiptPaper receipt={RECEIPT} className="struk-hanya-cetak" />);
    expect(screen.getByRole("region", { name: "Struk TG-2026-0123" })).toHaveClass("struk-kertas", "struk-hanya-cetak");
  });
});

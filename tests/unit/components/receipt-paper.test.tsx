import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { RECEIPT } from "../../fixtures/receipt";


describe("ReceiptPaper", () => {
  it("memuat semua bagian struk", () => {
    render(<ReceiptPaper receipt={RECEIPT} />);
    const paper = screen.getByRole("region", { name: "Struk TG-2026-0123" });
    for (const text of ["SunDY Clinic", "SunDY Mahakeret", "Jl. Mahakeret 1, Manado", "12 Okt 2026 pukul 18.46", "Mey", "Priscillya Jenitha", "Paket Lux", "2 x Rp 750.000", "Rp 1.500.000", "-Rp 100.000", "Rp 1.400.000", "QRIS", "Rp 400.000", "DEPOSIT"]) {
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

  it("baris deposit booking, saldo deposit, dan catatan kelebihan (spec deposit D9)", () => {
    render(<ReceiptPaper receipt={{ ...RECEIPT, bookingDeposit: 100_000, saldoDeposit: 50_000, depositNotes: ["Kelebihan Rp 50.000 menjadi deposit, berlaku s.d. 23 Nov 2026"] }} />);
    expect(screen.getByText("Deposit booking").parentElement).toHaveTextContent("-Rp 100.000");
    expect(screen.getByText("Saldo deposit").parentElement).toHaveTextContent("-Rp 50.000");
    expect(screen.getByText("Kelebihan Rp 50.000 menjadi deposit, berlaku s.d. 23 Nov 2026")).toBeInTheDocument();
  });

  it("tanpa deposit tidak ada baris deposit", () => {
    render(<ReceiptPaper receipt={RECEIPT} />);
    expect(screen.queryByText("Deposit booking")).toBeNull();
    expect(screen.queryByText("Saldo deposit")).toBeNull();
  });

  it("kelas tambahan ikut terpasang", () => {
    render(<ReceiptPaper receipt={RECEIPT} className="struk-hanya-cetak" />);
    expect(screen.getByRole("region", { name: "Struk TG-2026-0123" })).toHaveClass("struk-kertas", "struk-hanya-cetak");
  });

  it("baris berdiskon menampilkan potongan dan ringkasan diskon item", () => {
    render(<ReceiptPaper receipt={{ ...RECEIPT, lines: [{ ...RECEIPT.lines[0], discount: 100_000, amount: 1_400_000 }], itemDiscount: 100_000 }} />);
    const paper = screen.getByRole("region", { name: "Struk TG-2026-0123" });
    expect(paper).toHaveTextContent("Diskon item-Rp 100.000");
    expect(within(paper).getByRole("list", { name: "Item" })).toHaveTextContent("Diskon-Rp 100.000");
  });

  it("keterangan paket tampil di bawah nama baris", () => {
    render(<ReceiptPaper receipt={{ ...RECEIPT, lines: [{ ...RECEIPT.lines[0], note: "Sesi paket Facial 5x · sisa 2" }] }} />);
    expect(screen.getByText("Sesi paket Facial 5x · sisa 2")).toBeInTheDocument();
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvoiceA4Paper } from "@/components/receipt/invoice-a4-paper";
import { INVOICE_A4 } from "../../fixtures/invoice-a4";

describe("InvoiceA4Paper (spec invoice A4)", () => {
  it("kop surat, identitas invoice, item, total, dan pembayaran (IA2, IA4)", () => {
    const { container } = render(<InvoiceA4Paper invoice={INVOICE_A4} />);
    const paper = screen.getByRole("region", { name: "Invoice TG-2026-0123" });
    for (const text of [
      "Nutrition, Slimming & Wellness Clinic",
      "SunDY Mahakeret",
      "Jl. Garuda No. 10, Mahakeret Barat, Manado",
      "WA 0851-7222-8900",
      "IG @sundyclinic",
      "sundyclinic.com",
      "INVOICE",
      "Kasir: Rina",
      "Maria Sului",
      "RM SDY-2026-0007",
      "7 kapsul",
      "Jatah paket Glowing 3 Bulan",
      "22 Okt 2026 · Transfer bank ke BCA 1234567890 a.n. SunDY Clinic",
      "SisaRp 700.000",
    ]) {
      expect(paper).toHaveTextContent(text);
    }
    expect(container.querySelector(".invoice-a4 thead")).not.toBeNull();
  });

  it("cap air sesuai status (IA3)", () => {
    const { rerender } = render(<InvoiceA4Paper invoice={INVOICE_A4} />);
    expect(screen.getByRole("img", { name: "Status DEPOSIT" })).toHaveTextContent("DEPOSIT");
    for (const [status, text] of [["LUNAS", "LUNAS"], ["BELUM_DIBAYAR", "BELUM DIBAYAR"], ["DIBATALKAN", "DIBATALKAN"]] as const) {
      rerender(<InvoiceA4Paper invoice={{ ...INVOICE_A4, status }} />);
      expect(screen.getByRole("img", { name: `Status ${text}` })).toHaveTextContent(text);
    }
  });

  it("kotak Paket Anda per paket; tidak ada kotak tanpa paket (IA5)", () => {
    const { rerender } = render(<InvoiceA4Paper invoice={INVOICE_A4} />);
    const box = screen.getByRole("region", { name: "Paket Anda" });
    expect(box).toHaveTextContent("Glowing 3 Bulan · berlaku s.d. 19 Jan 2027");
    expect(box).toHaveTextContent("1 dari 4 sesi terpakai · sisa 3");
    expect(box).toHaveTextContent("7 dari 28 kapsul diterima · sisa 21");
    expect(within(box).getAllByRole("progressbar")).toHaveLength(2);
    expect(box).toHaveTextContent("Kunjungan berikutnya: 29 Okt 2026");
    rerender(<InvoiceA4Paper invoice={{ ...INVOICE_A4, packages: [{ ...INVOICE_A4.packages[0], nextVisitOn: null }] }} />);
    expect(screen.queryByText(/Kunjungan berikutnya/)).not.toBeInTheDocument();
    rerender(<InvoiceA4Paper invoice={{ ...INVOICE_A4, packages: [] }} />);
    expect(screen.queryByRole("region", { name: "Paket Anda" })).not.toBeInTheDocument();
  });
});

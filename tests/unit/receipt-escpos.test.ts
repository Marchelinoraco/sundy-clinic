import { describe, expect, it } from "vitest";
import type { PublicReceipt } from "@/lib/receipt";
import { buildEscPosReceipt, CUT_PAPER, ESC_INIT, receiptColumns, toPrinterText, wrapText } from "@/lib/receipt-escpos";

const RECEIPT: PublicReceipt = {
  clinicName: "SunDY Clinic",
  branchName: "SunDY Mahakeret",
  branchAddress: "Jl. Mahakeret No. 1, Wenang, Manado, Sulawesi Utara",
  number: "TG-2026-0123",
  finalizedAt: new Date("2026-10-12T10:46:00Z"),
  cashierName: "Mey",
  customerName: "Priscillya Jenitha Chiantoery",
  lines: [
    { name: "Paket Lux", quantity: 1, unitPrice: 1_500_000, amount: 1_500_000 },
    { name: "Krim pelembap wajah dengan ekstrak sakura dan niacinamide untuk kulit sensitif", quantity: 2, unitPrice: 125_000, amount: 250_000 },
    { name: "Café latte é", quantity: 1, unitPrice: 25_000, amount: 25_000 },
  ],
  subtotal: 1_775_000,
  discount: 75_000,
  total: 1_700_000,
  paid: 1_000_000,
  balance: 700_000,
  payments: [{ paidAt: "2026-10-12", method: "QRIS", amount: 1_000_000 }],
  status: "SEBAGIAN",
};

/** Baris yang tercetak: perintah ESC/POS dibuang. */
function printedLines(data: string): string[] {
  return data
    .replace(/\x1B@|\x1Ba[\x00-\x02]|\x1BE[\x00\x01]|\x1DVA\x03/g, "")
    .split("\n");
}

describe("lebar dan teks printer", () => {
  it("80 mm = 48 kolom, 58 mm = 32 kolom", () => {
    expect(receiptColumns(80)).toBe(48);
    expect(receiptColumns(58)).toBe(32);
  });

  it("aksen, tanda pisah, dan spasi tak putus jadi ASCII", () => {
    expect(toPrinterText("Café — é\u00a0x · ü")).toBe("Cafe - e x - u");
    expect(toPrinterText("😀 emoji")).toBe("? emoji");
  });

  it("membungkus per kata dan memotong kata yang terlalu panjang", () => {
    expect(wrapText("satu dua tiga empat", 9)).toEqual(["satu dua", "tiga", "empat"]);
    expect(wrapText("abcdefghijkl", 5)).toEqual(["abcde", "fghij", "kl"]);
    expect(wrapText("", 5)).toEqual([""]);
  });
});

describe("buildEscPosReceipt", () => {
  for (const width of [80, 58] as const) {
    it(`${width} mm: tidak ada baris lebih lebar dari ${receiptColumns(width)} kolom`, () => {
      for (const line of printedLines(buildEscPosReceipt(RECEIPT, width))) {
        expect(line.length, JSON.stringify(line)).toBeLessThanOrEqual(receiptColumns(width));
      }
    });
  }

  it("diawali inisialisasi dan diakhiri potong kertas", () => {
    const data = buildEscPosReceipt(RECEIPT, 80);
    expect(data.startsWith(ESC_INIT)).toBe(true);
    expect(data.endsWith(CUT_PAPER)).toBe(true);
  });

  it("memuat kepala, item, diskon, pembayaran, sisa, dan status", () => {
    const text = printedLines(buildEscPosReceipt(RECEIPT, 80)).join("\n");
    for (const part of ["SunDY Clinic", "SunDY Mahakeret", "No.", "TG-2026-0123", "12 Okt 2026 pukul 18.46", "Kasir", "Mey", "Paket Lux", "1 x Rp 1.500.000", "Rp 1.500.000", "Diskon", "-Rp 75.000", "Total", "Rp 1.700.000", "QRIS", "Sisa", "Rp 700.000", "DIBAYAR SEBAGIAN", "Terima kasih", "Cafe latte e"]) {
      expect(text, part).toContain(part);
    }
    expect(text).not.toContain("é");
  });

  it("jumlah rata kanan di baris 'qty x harga'", () => {
    const line = printedLines(buildEscPosReceipt(RECEIPT, 80)).find((l) => l.startsWith("1 x Rp 1.500.000"))!;
    expect(line).toHaveLength(48);
    expect(line.endsWith("Rp 1.500.000")).toBe(true);
  });

  it("lunas tanpa diskon: tidak ada baris Diskon dan Sisa", () => {
    const text = printedLines(
      buildEscPosReceipt({ ...RECEIPT, discount: 0, total: 1_775_000, paid: 1_775_000, balance: 0, status: "LUNAS" }, 58),
    ).join("\n");
    expect(text).not.toMatch(/^Diskon/m);
    expect(text).not.toMatch(/^Sisa/m);
    expect(text).toContain("LUNAS");
  });
});

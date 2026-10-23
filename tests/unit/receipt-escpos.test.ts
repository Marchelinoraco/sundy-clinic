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
    { name: "Paket Lux", quantity: 1, unitPrice: 1_500_000, gross: 1_500_000, discount: 0, amount: 1_500_000 },
    { name: "Krim pelembap wajah dengan ekstrak sakura dan niacinamide untuk kulit sensitif", quantity: 2, unitPrice: 125_000, gross: 250_000, discount: 0, amount: 250_000 },
    { name: "Café latte é", quantity: 1, unitPrice: 25_000, gross: 25_000, discount: 0, amount: 25_000 },
  ],
  subtotal: 1_775_000,
  itemDiscount: 0,
  discount: 75_000,
  total: 1_700_000,
  paid: 1_000_000,
  balance: 700_000,
  payments: [{ paidAt: "2026-10-12", method: "QRIS", amount: 1_000_000 }],
  status: "SEBAGIAN",
  bookingDeposit: 0,
  saldoDeposit: 0,
  depositNotes: [],
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

  it("baris deposit dan catatan kelebihan, tetap di dalam lebar kertas (spec deposit D9)", () => {
    const withDeposit = { ...RECEIPT, bookingDeposit: 100_000, saldoDeposit: 50_000, depositNotes: ["Kelebihan Rp 50.000 menjadi deposit, berlaku s.d. 23 Nov 2026"] };
    const printed = printedLines(buildEscPosReceipt(withDeposit, 58));
    expect(printed.find((line) => line.startsWith("Deposit booking"))).toMatch(/-Rp 100\.000$/);
    expect(printed.find((line) => line.startsWith("Saldo deposit"))).toMatch(/-Rp 50\.000$/);
    expect(printed.join(" ")).toContain("Kelebihan Rp 50.000 menjadi deposit,");
    for (const line of printed) expect(line.length).toBeLessThanOrEqual(receiptColumns(58));
  });

  it("diawali inisialisasi dan diakhiri potong kertas", () => {
    const data = buildEscPosReceipt(RECEIPT, 80);
    expect(data.startsWith(ESC_INIT)).toBe(true);
    expect(data.endsWith(CUT_PAPER)).toBe(true);
  });

  it("memuat kepala, item, diskon, pembayaran, sisa, dan status", () => {
    const text = printedLines(buildEscPosReceipt(RECEIPT, 80)).join("\n");
    for (const part of ["SunDY Clinic", "SunDY Mahakeret", "No.", "TG-2026-0123", "12 Okt 2026 pukul 18.46", "Kasir", "Mey", "Paket Lux", "1 x Rp 1.500.000", "Rp 1.500.000", "Diskon", "-Rp 75.000", "Total", "Rp 1.700.000", "QRIS", "Sisa", "Rp 700.000", "DEPOSIT", "Terima kasih", "Cafe latte e"]) {
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

  it("nama pelanggan dan kasir yang panjang tetap muat di 58 mm dan tidak terpotong isinya", () => {
    const longName = "Maria Fransiska Theresia Wulandari Simanjuntak";
    const longCashier = "Resepsionis Pagi Cabang Mahakeret Manado";
    const lines = printedLines(buildEscPosReceipt({ ...RECEIPT, customerName: longName, cashierName: longCashier }, 58));
    for (const line of lines) expect(line.length, JSON.stringify(line)).toBeLessThanOrEqual(32);
    const joined = lines.map((line) => line.trim()).join(" ");
    expect(joined).toContain("Maria Fransiska Theresia");
    expect(joined).toContain("Wulandari Simanjuntak");
    expect(joined).toContain("Kasir");
  });

  it("baris berdiskon mencetak Diskon di bawah baris, dan Diskon item di ringkasan", () => {
    const text = printedLines(
      buildEscPosReceipt({ ...RECEIPT, lines: [{ name: "Serum", quantity: 2, unitPrice: 150_000, gross: 300_000, discount: 30_000, amount: 270_000 }], itemDiscount: 30_000 }, 58),
    ).join("\n");
    expect(text).toMatch(/Diskon\s+-Rp 30\.000/);
    expect(text).toMatch(/Diskon item\s+-Rp 30\.000/);
  });

  it("keterangan paket dicetak di bawah nama baris", () => {
    const data = buildEscPosReceipt({ ...RECEIPT, lines: [{ ...RECEIPT.lines[0], note: "3× Facial · berlaku s.d. 10 Apr 2027" }] }, 80);
    expect(printedLines(data)).toContain("  3x Facial - berlaku s.d. 10 Apr 2027");
  });
});

import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CashFlowCard } from "@/components/admin/report/cash-flow-card";
import { ProfitTiles } from "@/components/admin/report/profit-tiles";
import { ReportDetail } from "@/components/admin/report/report-detail";
import { deltaText, ReportSummary } from "@/components/admin/report/report-summary";
import { TrendChart } from "@/components/admin/report/trend-chart";
import { compareReports, summarizeReport, type RawReport } from "@/lib/report";
import { renderAdmin } from "./helpers/render-admin";

const RAW: RawReport = {
  service: 1_000_000, treatment: 500_000, goods: 300_000, discount: 100_000, upfrontFee: 200_000, upfrontOnline: 250_000,
  cogs: 120_000, outstanding: 50_000, invoiceCount: 12,
  expenses: [
    { categoryId: "k1", name: "Sewa", isActive: true, amount: 400_000 },
    { categoryId: "k2", name: "Gaji lama", isActive: false, amount: 600_000 },
  ],
  customerPaid: 1_500_000, supplierPaid: 300_000, supplierRefunded: 50_000,
};
const PREVIOUS: RawReport = { ...RAW, service: 500_000, expenses: [{ categoryId: "k1", name: "Sewa", isActive: true, amount: 300_000 }] };
const LOSS: RawReport = { ...RAW, service: 0, treatment: 0, goods: 0, discount: 0, upfrontFee: 0, upfrontOnline: 0, cogs: 0, outstanding: 0, customerPaid: 0, supplierPaid: 0, supplierRefunded: 0 };

describe("teks perbandingan", () => {
  it("naik, turun, sama, dan tanpa persen", () => {
    expect(deltaText({ amount: 10, percent: 10 })).toBe("naik 10% (Rp 10) dari periode sebelumnya");
    expect(deltaText({ amount: -100, percent: -66.7 })).toBe("turun 66,7% (Rp 100) dari periode sebelumnya");
    expect(deltaText({ amount: 5, percent: null })).toBe("naik Rp 5 dari periode sebelumnya");
    expect(deltaText({ amount: 0, percent: null })).toBe("sama dengan periode sebelumnya");
    expect(deltaText({ amount: 0, percent: 0 })).toBe("sama dengan periode sebelumnya");
  });
});

describe("ringkasan laporan", () => {
  it("menampilkan lima angka utama dengan perbandingan; Laba bersih saat positif", () => {
    const current = summarizeReport(RAW);
    renderAdmin(<ReportSummary view={current} comparison={compareReports(current.totals, summarizeReport(PREVIOUS).totals)} />);
    const section = screen.getByRole("region", { name: "Ringkasan laporan" });
    for (const label of ["Pendapatan", "Harga pokok", "Laba kotor", "Pengeluaran", "Laba bersih"]) {
      expect(within(section).getByText(label)).toBeInTheDocument();
    }
    expect(within(section).getByText("Laba bersih").parentElement).toHaveTextContent("Rp 1.030.000");
    expect(within(section).getByText("Pendapatan").parentElement).toHaveTextContent("Rp 2.150.000");
    expect(within(section).getByText("Pendapatan").parentElement).toHaveTextContent("naik");
  });

  it("menulis Rugi bersih bila negatif", () => {
    const view = summarizeReport(LOSS);
    renderAdmin(<ReportSummary view={view} comparison={compareReports(view.totals, view.totals)} />);
    expect(screen.getByText("Rugi bersih")).toBeInTheDocument();
    expect(screen.queryByText("Laba bersih")).toBeNull();
    expect(screen.getByText("Rugi bersih").parentElement).toHaveTextContent("1.000.000");
  });
});

describe("rincian laporan", () => {
  it("rincian pendapatan, pengeluaran per kategori (nonaktif bertanda), dan belum tertagih untuk dua periode", () => {
    renderAdmin(<ReportDetail current={summarizeReport(RAW)} previous={summarizeReport(PREVIOUS)} />);
    const table = screen.getByRole("table", { name: "Rincian laporan" });
    const row = (name: string) => within(table).getByText(name).closest("tr")!;
    expect(row("Layanan")).toHaveTextContent("Rp 1.000.000");
    expect(row("Layanan")).toHaveTextContent("Rp 500.000");
    expect(row("Diskon")).toHaveTextContent("Rp 100.000");
    expect(row("Total pendapatan")).toHaveTextContent("Rp 2.150.000");
    expect(row("Harga pokok")).toHaveTextContent("Rp 120.000");
    expect(row("Sewa")).toHaveTextContent("Rp 400.000");
    expect(row("Sewa")).toHaveTextContent("Rp 300.000");
    expect(row("Gaji lama (nonaktif)")).toHaveTextContent("Rp 600.000");
    expect(row("Total pengeluaran")).toHaveTextContent("Rp 1.000.000");
    expect(row("Laba bersih")).toHaveTextContent("Rp 1.030.000");
    expect(row("Belum tertagih (informasi)")).toHaveTextContent("Rp 50.000");
  });
});

describe("arus kas", () => {
  it("menampilkan masuk, keluar, dan kas bersih; hutang supplier terpisah dari laba", () => {
    renderAdmin(<CashFlowCard cash={summarizeReport(RAW).cash} />);
    const section = screen.getByRole("region", { name: "Arus kas" });
    expect(within(section).getByText("Total masuk").closest("tr")).toHaveTextContent("Rp 1.950.000");
    expect(within(section).getByText("Pembayaran hutang supplier (neto)").closest("tr")).toHaveTextContent("Rp 250.000");
    expect(within(section).getByText("Total keluar").closest("tr")).toHaveTextContent("Rp 1.250.000");
    expect(within(section).getByText("Kas bersih").closest("tr")).toHaveTextContent("Rp 700.000");
    expect(within(section).getByText(/tidak mengurangi laba/i)).toBeInTheDocument();
  });
});

describe("grafik tren", () => {
  const points = [
    { month: "2026-08", revenue: 1000, cost: 400, netProfit: 600 },
    { month: "2026-09", revenue: 500, cost: 900, netProfit: -400 },
    { month: "2026-10", revenue: 0, cost: 0, netProfit: 0 },
  ];

  it("gambar dengan nama dan tabel tersembunyi berisi angka tiap bulan", () => {
    renderAdmin(<TrendChart points={points} />);
    expect(screen.getByRole("img", { name: "Grafik tren 12 bulan" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Data tren bulanan" });
    expect(within(table).getByText("Ags 2026").closest("tr")).toHaveTextContent("Rp 1.000");
    expect(within(table).getByText("Sep 2026").closest("tr")).toHaveTextContent("400");
  });
});

describe("kotak dasbor", () => {
  it("laba bulan ini dan rugi bulan ini", () => {
    const { rerender } = renderAdmin(<ProfitTiles profit={{ month: "2026-10", revenue: 2_000_000, netProfit: 750_000 }} />);
    const profit = screen.getByRole("link", { name: /Laba bersih bulan ini/ });
    expect(profit).toHaveAttribute("href", "/admin/laporan");
    expect(profit).toHaveTextContent("750.000");
    rerender(<ProfitTiles profit={{ month: "2026-10", revenue: 0, netProfit: -300_000 }} />);
    expect(screen.getByRole("link", { name: /Rugi bersih bulan ini/ })).toHaveTextContent("300.000");
  });
});

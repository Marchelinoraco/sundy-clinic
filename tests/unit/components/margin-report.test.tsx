import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarginReportView } from "@/components/admin/report/margin-report";
import { renderAdmin } from "../helpers/render-admin";

const report = {
  goods: { revenue: 300_000, stockCost: 4000, materialCost: 0, toolCost: 0, otherCost: 0, commission: 0 },
  treatment: { revenue: 450_000, stockCost: 0, materialCost: 80_000, toolCost: 20_000, otherCost: 16_000, commission: 50_000 },
  packageRevenue: 600_000,
  serviceRevenue: 150_000,
  invoiceDiscount: 30_000,
  byItem: [{ name: "Serum C", quantity: 2, revenue: 300_000, cost: 4000 }],
  byTreatment: [{ name: "Facial Uji", quantity: 2, revenue: 450_000, materialCost: 80_000, toolCost: 20_000, otherCost: 16_000, commission: 50_000 }],
};

describe("MarginReportView", () => {
  it("ringkasan per kelompok dengan persen margin, lalu tabel per barang dan per treatment", () => {
    renderAdmin(<MarginReportView report={report} />);
    const summary = screen.getByRole("table", { name: "Margin per kelompok" });
    expect(summary).toHaveTextContent("Obat dan produkRp 300.000Rp 4.000Rp 296.000");
    expect(summary).toHaveTextContent("98,7%");
    expect(summary).toHaveTextContent("TreatmentRp 450.000Rp 166.000Rp 284.000");
    expect(summary).toHaveTextContent("PaketRp 600.000");
    expect(summary).toHaveTextContent("Diskon tagihan-Rp 30.000");
    expect(summary).toHaveTextContent("LayananRp 150.000");
    expect(summary).toHaveTextContent("Total marginRp 1.300.000");
    expect(screen.getByRole("table", { name: "Margin per barang" })).toHaveTextContent("Serum C");
    const treatments = screen.getByRole("table", { name: "Margin per treatment" });
    expect(treatments).toHaveTextContent("Lainnya");
    expect(treatments).toHaveTextContent("Facial Uji2Rp 450.000Rp 80.000Rp 20.000Rp 16.000Rp 50.000Rp 284.000");
  });
});

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommissionReportView } from "@/components/admin/report/commission-report";
import { renderAdmin } from "../helpers/render-admin";

const rows = [
  { performerId: "t1", performerName: "Rina", treatments: 3, commission: 75_000 },
  { performerId: "d1", performerName: "dr. Uji", treatments: 1, commission: 30_000 },
];

describe("CommissionReportView", () => {
  it("daftar pelaksana bertaut ke rinciannya; rincian tampil bila dipilih", () => {
    renderAdmin(
      <CommissionReportView
        rows={rows}
        details={[{ finalizedAt: new Date("2026-10-05T03:00:00Z"), invoiceId: "i1", invoiceNumber: "TG-2026-0001", customerName: "Ani", treatment: "Facial", quantity: 2, commission: 50_000, performerName: "Rina" }]}
        selected="t1"
        hrefFor={(id) => `/admin/laporan?tab=komisi&pelaksana=${id}`}
        downloadHref="/admin/laporan/unduh?jenis=komisi"
      />,
    );
    const table = screen.getByRole("table", { name: "Komisi per pelaksana" });
    expect(table).toHaveTextContent("Rina3Rp 75.000");
    expect(table).toHaveTextContent("TotalRp 105.000");
    expect(screen.getByRole("link", { name: "dr. Uji" })).toHaveAttribute("href", "/admin/laporan?tab=komisi&pelaksana=d1");
    const detail = screen.getByRole("table", { name: "Rincian komisi Rina" });
    expect(detail).toHaveTextContent("TG-2026-0001");
    expect(detail).toHaveTextContent("Rp 50.000");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReportFilter } from "@/components/admin/report/report-filter";

vi.mock("next/form", () => ({ default: ({ children, ...props }: { children: ReactNode }) => <form {...props}>{children}</form> }));

const branches = [{ id: "b1", name: "Mahakeret" }];
const period = { from: "2026-10-01", to: "2026-10-31" };

describe("filter laporan", () => {
  it("memilih Rentang bebas otomatis saat tanggal diubah, supaya tanggal tidak diabaikan", async () => {
    render(<ReportFilter preset="BULAN_INI" period={period} branchId={null} branches={branches} />);
    expect(screen.getByLabelText("Periode")).toHaveValue("BULAN_INI");
    const from = screen.getByLabelText("Dari tanggal");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-10-05");
    expect(screen.getByLabelText("Periode")).toHaveValue("RENTANG");
  });

  it("memilih periode siap pakai tidak mengubah pilihan lain; cabang terpilih tetap", async () => {
    render(<ReportFilter preset="RENTANG" period={period} branchId="b1" branches={branches} />);
    expect(screen.getByLabelText("Cabang")).toHaveValue("b1");
    await userEvent.selectOptions(screen.getByLabelText("Periode"), "TAHUN_INI");
    expect(screen.getByLabelText("Periode")).toHaveValue("TAHUN_INI");
    expect(screen.getByLabelText("Cabang")).toHaveValue("b1");
  });
});

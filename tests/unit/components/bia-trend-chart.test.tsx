import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BiaTrendChart } from "@/components/admin/bia/bia-trend-chart";
import { renderAdmin } from "../helpers/render-admin";

describe("grafik komposisi tubuh", () => {
  it("tanpa titik: keterangan kosong, tanpa grafik", () => {
    renderAdmin(<BiaTrendChart points={[]} />);
    expect(screen.getByText("Belum ada hasil BIA.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Grafik komposisi tubuh" })).toBeNull();
  });

  it("grafik bernama dan tabel tersembunyi berisi angka tiap pengukuran, terlama dulu", () => {
    renderAdmin(
      <BiaTrendChart
        points={[
          { at: new Date("2026-09-02T02:00:00Z"), bodyFatPercent: 32, muscleMassKg: 40 },
          { at: new Date("2026-10-09T02:00:00Z"), bodyFatPercent: 28.5, muscleMassKg: null },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Grafik komposisi tubuh" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Data komposisi tubuh" });
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual([expect.stringMatching(/2 Sep.*32 %.*40 kg/), expect.stringMatching(/9 Okt.*28,5 %.*—/)]);
  });
});

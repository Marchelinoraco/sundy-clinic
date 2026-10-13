import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EncounterRecord } from "@/components/admin/encounter-record";
import { encounterDetail } from "../../fixtures/encounter-detail";
import { renderAdmin } from "../helpers/render-admin";

describe("EncounterRecord: resep (spec resep dokter 3–4)", () => {
  it("menampilkan resep beserta keterangan penagihan, dan Catatan untuk Apoteker lama bila ada", () => {
    renderAdmin(
      <EncounterRecord
        encounter={encounterDetail({
          pharmacyNote: "Amoxicillin 3x1 (lama)",
          prescriptions: [
            { id: "p1", itemName: "Amoxicillin", quantity: 10, usage: "3 x 1 sesudah makan", billing: "Ditagih 5 dari 10 — Stok kurang" },
            { id: "p2", itemName: "Vitamin C", quantity: 30, usage: "1 x 1", billing: null },
          ],
        })}
      />,
    );
    const table = screen.getByRole("table", { name: "Resep" });
    expect(table).toHaveTextContent("Amoxicillin");
    expect(table).toHaveTextContent("3 x 1 sesudah makan");
    expect(table).toHaveTextContent("Ditagih 5 dari 10 — Stok kurang");
    expect(screen.getByText("Amoxicillin 3x1 (lama)")).toBeInTheDocument();
  });

  it("tanpa resep: keterangan kosong, tanpa Catatan untuk Apoteker", () => {
    renderAdmin(<EncounterRecord encounter={encounterDetail()} />);
    expect(screen.getByText("Tidak ada resep di kunjungan ini.")).toBeInTheDocument();
    expect(screen.queryByText("Catatan untuk Apoteker")).not.toBeInTheDocument();
  });
});

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

describe("EncounterRecord: treatment (spec aturan pakai PL4)", () => {
  it("kolom Pelaksana hanya bila ada treatment yang punya pelaksana", () => {
    const { unmount } = renderAdmin(
      <EncounterRecord encounter={encounterDetail({ treatments: [{ serviceName: "Meso", area: "Perut", dose: null, performerName: "dr. Diane", notes: null }] })} />,
    );
    expect(screen.getByRole("columnheader", { name: "Pelaksana" })).toBeInTheDocument();
    expect(screen.getByText("dr. Diane", { selector: "td" })).toBeInTheDocument();
    unmount();

    renderAdmin(<EncounterRecord encounter={encounterDetail({ treatments: [{ serviceName: "Meso", area: "Perut", dose: null, performerName: null, notes: null }] })} />);
    expect(screen.getByText("Meso")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Pelaksana" })).toBeNull();
  });
});

describe("EncounterRecord: angka vital perawat (spec vital perawat VP6)", () => {
  it("menyebut perawat yang mengukur dan tanda diubah dokter", () => {
    renderAdmin(
      <EncounterRecord
        encounter={encounterDetail({ nurseVitals: { byName: "Rina", at: new Date("2026-10-23T01:15:00Z"), changedByDoctor: true, values: { systolic: null, diastolic: null, pulse: null, temperatureC: null, weightKg: 72.5, heightCm: null, waistCm: null } } })}
      />,
    );
    expect(screen.getByText("Diukur perawat Rina · 09.15 · diubah dokter")).toBeInTheDocument();
  });
});

describe("EncounterRecord: paket di resep (spec vital perawat PR1, PR3)", () => {
  it("menampilkan paket dengan isinya, dan keterangan bila tidak dibeli", () => {
    renderAdmin(
      <EncounterRecord
        encounter={encounterDetail({
          packages: [
            { id: "ep1", name: "Glowing 3 Bulan", contents: "4× Facial Brightening", declined: null },
            { id: "ep2", name: "Slim Start", contents: "2× RF Perut", declined: "Tidak dibeli — Pasien pikir-pikir dulu" },
          ],
        })}
      />,
    );
    const list = screen.getByRole("list", { name: "Paket" });
    expect(list).toHaveTextContent("Glowing 3 Bulan · 4× Facial Brightening");
    expect(list).toHaveTextContent("Slim Start · 2× RF Perut · Tidak dibeli — Pasien pikir-pikir dulu");
  });
});

import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NurseWorklistView } from "@/components/admin/nurse/nurse-worklist";
import type { NurseWorklistRow } from "@/server/nurse";
import { renderAdmin } from "../helpers/render-admin";

const row = (patch: Partial<NurseWorklistRow>): NurseWorklistRow => ({
  handled: false,
  appointmentId: "a1",
  startAt: new Date("2026-10-20T03:00:00Z"), // 11.00 WITA
  patientName: "Mario Sului",
  patientRecordNumber: "SDY-2026-0013",
  serviceName: "Konsultasi gizi",
  staffName: "dr. Diane",
  branchName: "SunDY Mahakeret",
  foodRecall: "BELUM",
  bia: "BELUM",
  ...patch,
});

describe("NurseWorklistView (spec peran perawat 6)", () => {
  it("satu baris per pasien: jam, nama + No. RM, layanan, tenaga, status, dan Tangani", () => {
    renderAdmin(<NurseWorklistView rows={[row({}), row({ appointmentId: "a2", patientName: "Pasien B", foodRecall: "TERISI", bia: "ANGKA", handled: true }), row({ appointmentId: "a3", patientName: "Pasien C", bia: "BERKAS" })]} />);
    const region = screen.getByRole("region", { name: "Pasien hari ini" });
    const rows = within(region).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const first = within(rows[0]);
    expect(first.getByText("11.00")).toBeInTheDocument();
    expect(first.getByText("Mario Sului")).toBeInTheDocument();
    expect(first.getByText("SDY-2026-0013")).toBeInTheDocument();
    expect(first.getByText("Konsultasi gizi")).toBeInTheDocument();
    expect(first.getByText("dr. Diane")).toBeInTheDocument();
    expect(first.getAllByText("belum")).toHaveLength(2);
    expect(first.getByRole("link", { name: "Tangani Mario Sului" })).toHaveAttribute("href", "/admin/perawat/a1");
    expect(within(rows[1]).getByText("terisi")).toBeInTheDocument();
    expect(within(rows[1]).getByText("angka")).toBeInTheDocument();
    expect(within(rows[2]).getByText("berkas")).toBeInTheDocument();
    // Status penanganan perawat (spec vital perawat VP3).
    expect(first.getByText("Belum ditangani")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Selesai ditangani")).toBeInTheDocument();
  });

  it("kosong", () => {
    renderAdmin(<NurseWorklistView rows={[]} />);
    expect(screen.getByText("Belum ada pasien yang check-in hari ini.")).toBeInTheDocument();
  });

  it("judul bisa dibedakan untuk peran yang juga melihat daftar dokter", () => {
    renderAdmin(<NurseWorklistView rows={[]} title="Food recall & BIA hari ini" />);
    expect(screen.getByRole("region", { name: "Food recall & BIA hari ini" })).toBeInTheDocument();
  });
});

import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PatientTable, type PatientTableRow } from "@/components/admin/patient-table";
import { mockGridLayout } from "../helpers/mui";
import { renderAdmin } from "../helpers/render-admin";

const row = (patch: Partial<PatientTableRow>): PatientTableRow => ({
  id: "p1",
  medicalRecordNumber: "SDY-2026-0012",
  name: "Maria Wenas",
  whatsapp: "6281234567001",
  programStatus: "AKTIF",
  programLabel: "Aktif",
  lastVisitAt: null,
  nextBookingAt: null,
  ...patch,
});

beforeEach(() => mockGridLayout());

describe("PatientTable", () => {
  it("nama bertautan ke detail, program sebagai chip, kunjungan kosong tertulis —", () => {
    renderAdmin(<PatientTable patients={[row({})]} emptyText="Belum ada pasien." />);
    expect(screen.getByRole("grid", { name: "Daftar pasien" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Maria Wenas" })).toHaveAttribute("href", "/admin/pasien/p1");
    expect(screen.getByText("Aktif").closest(".MuiChip-root")).not.toBeNull();
    const cells = screen.getAllByRole("gridcell");
    expect(cells.some((cell) => cell.textContent === "—")).toBe(true);
  });

  it("kosong: teks dari halaman", () => {
    renderAdmin(<PatientTable patients={[]} emptyText="Tidak ada pasien yang cocok dengan “zzz”." />);
    expect(screen.getByText("Tidak ada pasien yang cocok dengan “zzz”.")).toBeInTheDocument();
  });
});

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientPackageTable } from "@/components/admin/package/patient-package-table";
import type { PatientPackageSummary } from "@/server/patient-package-read";
import { renderAdmin } from "../helpers/render-admin";

const row: PatientPackageSummary = {
  id: "pp1",
  name: "Paket Glowing",
  startsOn: "2026-10-13",
  expiresOn: "2027-04-10",
  state: "AKTIF",
  items: [
    { serviceName: "Facial", unit: null, sessions: 3, remaining: 2 },
    { serviceName: "Peeling", unit: null, sessions: 2, remaining: 2 },
    { serviceName: "Slimming", unit: "kapsul", sessions: 30, remaining: 20 },
  ],
  purchaseInvoice: { id: "inv1", number: "TG-2026-0042" },
  patient: { id: "p1", name: "Ani Uji", medicalRecordNumber: "SDY-2026-0001" },
};

describe("PatientPackageTable", () => {
  it("menampilkan customer, paket bertaut, sisa per treatment, berlaku, dan status", () => {
    renderAdmin(<PatientPackageTable rows={[row, { ...row, id: "pp2", name: "Paket Lama", state: "KEDALUWARSA" }]} />);
    const table = screen.getByRole("table", { name: "Paket customer" });
    expect(table).toHaveTextContent("Ani Uji");
    expect(table).toHaveTextContent("SDY-2026-0001");
    expect(screen.getByRole("link", { name: "Paket Glowing" })).toHaveAttribute("href", "/admin/paket/pp1");
    expect(table).toHaveTextContent("Facial 2 dari 3");
    expect(table).toHaveTextContent("Peeling 2 dari 2");
    expect(table).toHaveTextContent("Slimming 20 dari 30 kapsul");
    expect(table).toHaveTextContent("10 Apr 2027");
    expect(table).toHaveTextContent("Aktif");
    expect(table).toHaveTextContent("Kedaluwarsa");
  });

  it("tanpa kolom customer di halaman pasien; kosong memberi tahu", () => {
    const { unmount } = renderAdmin(<PatientPackageTable rows={[row]} showPatient={false} />);
    expect(screen.queryByText("Ani Uji")).not.toBeInTheDocument();
    unmount();
    renderAdmin(<PatientPackageTable rows={[]} />);
    expect(screen.getByText("Belum ada paket.")).toBeInTheDocument();
  });
});

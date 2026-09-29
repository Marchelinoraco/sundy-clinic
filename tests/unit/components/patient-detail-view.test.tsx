import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientDetailView } from "@/components/admin/patient-detail-view";
import type { PatientDetail } from "@/server/patient";

const patient: PatientDetail = {
  id: "p1",
  medicalRecordNumber: "SDY-2026-0001",
  name: "Siti Rahayu",
  whatsapp: "6281234567890",
  birthDateLabel: "17/04/1992",
  genderLabel: "Perempuan",
  occupation: "Guru",
  address: "Jl. Sam Ratulangi",
  programStatus: "AKTIF",
  record: { allergies: "Amoxicillin", medicalHistory: null },
  appointments: [
    {
      id: "a1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-07T05:00:00Z"),
      status: "TERKONFIRMASI",
      serviceName: "Konsultasi Dokter",
      staffName: "Dr. Diane",
      branchName: "SunDY Mahakeret",
    },
  ],
  intakes: [
    {
      id: "i1",
      code: "SDY-8F3K",
      submittedAt: new Date("2026-10-01T02:00:00Z"),
      status: "DIPERIKSA",
      kind: "LENGKAP",
      purposeLabel: "Slimming",
      reviewerName: "Dr. Diane",
      reviewedAt: new Date("2026-10-02T02:00:00Z"),
    },
  ],
};

describe("PatientDetailView", () => {
  it("menampilkan catatan medis dan tautan isian untuk pembaca rekam medis", () => {
    render(<PatientDetailView patient={patient} canReadRecords />);
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText("Belum ada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    expect(screen.getByText(/Diperiksa · Dr\. Diane/)).toBeInTheDocument();
  });

  it("tanpa hak rekam medis: tanpa catatan medis dan tanpa tautan isian", () => {
    render(<PatientDetailView patient={{ ...patient, record: null }} canReadRecords={false} />);
    expect(screen.queryByRole("heading", { name: "Catatan medis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lihat isian" })).not.toBeInTheDocument();
    // Kode booking tampil di riwayat booking dan riwayat isian.
    expect(screen.getAllByText("SDY-8F3K")).toHaveLength(2);
  });
});

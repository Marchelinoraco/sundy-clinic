import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatientDetailView } from "@/components/admin/patient-detail-view";
import type { PatientDetail } from "@/server/patient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Formulir sunting memanggil server action dari modul ini.
vi.mock("@/server/patient", () => ({ updatePatientImportantNotes: vi.fn(), updatePaperRecordNumber: vi.fn() }));

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
  paperRecordNumber: "RM-0457",
  record: { allergies: "Amoxicillin", medicalHistory: null, importantNotes: "Takut jarum" },
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
  encounters: [
    {
      id: "e1",
      code: "SDY-8F3K",
      startAt: new Date("2026-10-07T05:00:00Z"),
      branchName: "SunDY Mahakeret",
      authorName: "Dr. Diane",
      assessmentPreview: "Obesitas derajat 1",
      status: "FINAL",
    },
  ],
};

const receptionistView: PatientDetail = { ...patient, record: null, encounters: null };

describe("PatientDetailView", () => {
  it("menampilkan catatan medis dan tautan isian untuk pembaca rekam medis", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(screen.getByText("Amoxicillin")).toBeInTheDocument();
    expect(screen.getByText("Belum ada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    expect(screen.getByText(/Diperiksa · Dr\. Diane/)).toBeInTheDocument();
  });

  it("menampilkan riwayat kunjungan dengan cuplikan penilaian dan tautan ke kunjungan", () => {
    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    const visits = screen.getByRole("region", { name: "Riwayat kunjungan" });
    expect(within(visits).getByText("Obesitas derajat 1")).toBeInTheDocument();
    expect(within(visits).getByText("Final")).toBeInTheDocument();
    expect(within(visits).getByRole("link", { name: "Buka" })).toHaveAttribute("href", "/admin/kunjungan/e1");
  });

  it("catatan penting bisa diubah hanya oleh penulis rekam medis", () => {
    const { unmount } = render(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(screen.getByText("Takut jarum")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah catatan penting" })).toBeInTheDocument();
    unmount();

    render(<PatientDetailView patient={patient} canReadRecords canWriteRecords={false} />);
    expect(screen.getByText("Takut jarum")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ubah catatan penting" })).not.toBeInTheDocument();
  });

  it("tanpa hak rekam medis: tanpa catatan medis, riwayat kunjungan, dan tautan isian; no. RM kertas lama tetap ada", () => {
    render(<PatientDetailView patient={receptionistView} canReadRecords={false} canWriteRecords={false} />);
    expect(screen.queryByRole("heading", { name: "Catatan medis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Riwayat kunjungan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lihat isian" })).not.toBeInTheDocument();
    expect(screen.getByText("RM-0457")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah no. RM kertas lama" })).toBeInTheDocument();
    // Kode booking tampil di riwayat booking dan riwayat isian.
    expect(screen.getAllByText("SDY-8F3K")).toHaveLength(2);
  });
});

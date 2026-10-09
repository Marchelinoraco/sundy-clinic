import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatientDetailView } from "@/components/admin/patient-detail-view";
import type { PatientDetail } from "@/server/patient";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Formulir sunting memanggil server action dari modul ini.
vi.mock("@/server/patient", () => ({ updatePatientImportantNotes: vi.fn(), updatePaperRecordNumber: vi.fn(), updatePatientNik: vi.fn() }));

const patient: PatientDetail = {
  id: "p1",
  medicalRecordNumber: "SDY-2026-0001",
  name: "Siti Rahayu",
  whatsapp: "6281234567890",
  birthDateLabel: "17/04/1992",
  ageYears: 34,
  genderLabel: "Perempuan",
  occupation: "Guru",
  address: "Jl. Sam Ratulangi",
  programStatus: "AKTIF",
  lastVisitAt: new Date("2026-10-07T05:00:00Z"),
  paperRecordNumber: "RM-0457",
  nik: "7171015705900001",
  nikMissingReason: null,
  mergedInto: null,
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
      foodRecall: {
        appointmentId: "a1",
        state: "FILLED",
        recallDate: "2026-10-06",
        recallDateLabel: "Selasa, 6 Oktober",
        entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" }],
        submittedAt: null,
        completedAt: null,
        completedByName: null,
      },
    },
  ],
};

const receptionistView: PatientDetail = { ...patient, record: null, encounters: null };

describe("PatientDetailView (spec D 5.3)", () => {
  it("data diri dan catatan medis berdampingan; alergi bertanda", () => {
    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    const identity = screen.getByRole("region", { name: "Data diri" });
    expect(identity).toHaveTextContent("17/04/1992 (34 tahun)");
    expect(identity).toHaveTextContent("Jl. Sam Ratulangi");
    expect(within(identity).getByText("RM-0457")).toBeInTheDocument();
    const record = screen.getByRole("region", { name: "Catatan medis" });
    expect(within(record).getByText("Amoxicillin")).toHaveAttribute("data-allergy", "true");
    expect(within(record).getByText("Belum ada")).toBeInTheDocument();
  });

  it("tab Kunjungan terbuka pertama bila ada kunjungan, dengan jumlah di judul tab", () => {
    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    const tabs = screen.getByRole("navigation", { name: "Riwayat pasien" });
    expect(within(tabs).getByRole("link", { name: "Kunjungan (1)" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Booking (1)" })).toHaveAttribute("href", "/admin/pasien/p1?tab=booking");
    const visits = screen.getByRole("region", { name: "Riwayat kunjungan" });
    expect(within(visits).getByText("Obesitas derajat 1")).toBeInTheDocument();
    expect(within(visits).getByRole("link", { name: "Buka" })).toHaveAttribute("href", "/admin/kunjungan/e1");
    expect(screen.queryByRole("region", { name: "Riwayat booking" })).not.toBeInTheDocument();
  });

  it("tab Isian: tautan isian untuk pembaca rekam medis", () => {
    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords tab="isian" />);
    const intakes = screen.getByRole("region", { name: "Riwayat isian" });
    expect(within(intakes).getByRole("link", { name: "Lihat isian" })).toHaveAttribute("href", "/admin/isian/i1");
    expect(within(intakes).getByText(/Diperiksa · Dr\. Diane/)).toBeInTheDocument();
  });

  it("tab yang tidak dikenal kembali ke tab awal", () => {
    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords tab="salah" />);
    expect(screen.getByRole("region", { name: "Riwayat kunjungan" })).toBeInTheDocument();
  });

  it("catatan penting bisa diubah hanya oleh penulis rekam medis", () => {
    const { unmount } = renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(screen.getByText("Takut jarum")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah catatan penting" })).toBeInTheDocument();
    unmount();

    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords={false} />);
    expect(screen.getByText("Takut jarum")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ubah catatan penting" })).not.toBeInTheDocument();
  });

  it("tanpa hak rekam medis: tanpa catatan medis dan tab Kunjungan; tab awal Booking; no. RM kertas lama tetap ada", () => {
    renderAdmin(<PatientDetailView patient={receptionistView} canReadRecords={false} canWriteRecords={false} />);
    expect(screen.queryByRole("region", { name: "Catatan medis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Kunjungan/ })).not.toBeInTheDocument();
    const bookings = screen.getByRole("region", { name: "Riwayat booking" });
    expect(within(bookings).getByText("SDY-8F3K")).toBeInTheDocument();
    expect(screen.getByText("RM-0457")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah no. RM kertas lama" })).toBeInTheDocument();
  });

  it("tanpa hak rekam medis, tab Isian tanpa tautan ke isian", () => {
    renderAdmin(<PatientDetailView patient={receptionistView} canReadRecords={false} canWriteRecords={false} tab="isian" />);
    expect(within(screen.getByRole("region", { name: "Riwayat isian" })).getByText("SDY-8F3K")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lihat isian" })).not.toBeInTheDocument();
  });

  it("NIK tampil di data diri", () => {
    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    expect(within(screen.getByRole("region", { name: "Data diri" })).getByText("7171015705900001")).toBeInTheDocument();
  });

  it("riwayat kunjungan memuat food recall yang bisa dibuka", () => {
    renderAdmin(<PatientDetailView patient={patient} canReadRecords canWriteRecords />);
    const visits = screen.getByRole("region", { name: "Riwayat kunjungan" });
    expect(within(visits).getByText("Food recall Selasa, 6 Oktober")).toBeInTheDocument();
    // Isinya di dalam <details> yang tertutup: dicari lewat teks, bukan peran tabel.
    expect(within(visits).getByText("Nasi kuning")).toBeInTheDocument();
  });

  it("pasien rangkap menunjuk pasien lamanya", () => {
    renderAdmin(
      <PatientDetailView
        patient={{ ...patient, mergedInto: { id: "p9", medicalRecordNumber: "SDY-2026-0009", name: "Siti Lama" } }}
        canReadRecords
        canWriteRecords
      />,
    );
    expect(screen.getByRole("link", { name: "Siti Lama (SDY-2026-0009)" })).toHaveAttribute("href", "/admin/pasien/p9");
    expect(screen.getByText(/Pasien ini rangkap dari/)).toBeInTheDocument();
  });
});

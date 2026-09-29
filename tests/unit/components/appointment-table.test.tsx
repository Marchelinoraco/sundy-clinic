import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";

vi.mock("@/server/appointment", () => ({
  cancelAppointment: vi.fn(),
  markAttended: vi.fn(),
  markNoShow: vi.fn(),
  verifyAppointment: vi.fn(),
}));
vi.mock("@/server/intake", () => ({
  createPatientFromIntake: vi.fn(),
  getMatchCandidates: vi.fn(),
  matchPatient: vi.fn(),
}));

const base: BookingRow = {
  id: "a1",
  code: "SDY-8F3K",
  status: "MENUNGGU_KONFIRMASI",
  timeLabel: "15.00–15.30",
  patientName: "Siti Rahayu",
  patientRecordNumber: "SDY-2026-0001",
  serviceName: "Konsultasi Dokter",
  staffName: "Dr. Diane",
  branchName: "SunDY Mahakeret",
  sourceLabel: "Situs",
  notes: null,
  confirmation: null,
  needsMatch: false,
  isSiteBooking: true,
  intakeId: "i1",
};

describe("AppointmentTable pencocokan pasien", () => {
  it("booking situs yang belum dicocokkan menawarkan Cocokkan pasien dan belum Verifikasi", () => {
    render(<AppointmentTable rows={[{ ...base, needsMatch: true, patientRecordNumber: "—" }]} canReadRecords={false} />);
    expect(screen.getByRole("button", { name: "Cocokkan pasien" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verifikasi" })).not.toBeInTheDocument();
  });

  it("booking situs yang sudah dicocokkan tetap boleh Ganti pasien sebelum diverifikasi", () => {
    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.getByRole("button", { name: "Ganti pasien" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
  });

  it("booking situs yang sudah terkonfirmasi tidak lagi menawarkan Ganti pasien", () => {
    render(<AppointmentTable rows={[{ ...base, status: "TERKONFIRMASI" }]} canReadRecords={false} />);
    expect(screen.queryByRole("button", { name: "Ganti pasien" })).not.toBeInTheDocument();
  });

  it("booking admin (telepon/WhatsApp) tidak menawarkan pencocokan", () => {
    render(
      <AppointmentTable
        rows={[{ ...base, sourceLabel: "Telepon", isSiteBooking: false, intakeId: null }]}
        canReadRecords={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ganti pasien" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cocokkan pasien" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verifikasi" })).toBeInTheDocument();
  });
});

describe("AppointmentTable batas kedaluwarsa", () => {
  it("menampilkan batas kedaluwarsa bila ada", () => {
    render(<AppointmentTable rows={[{ ...base, deadlineLabel: "Kedaluwarsa Sen, 5 Okt 15.00" }]} canReadRecords={false} />);
    expect(screen.getByText("Kedaluwarsa Sen, 5 Okt 15.00")).toBeInTheDocument();
  });

  it("tidak menampilkan apa pun bila tidak ada batas", () => {
    render(<AppointmentTable rows={[base]} canReadRecords={false} />);
    expect(screen.queryByText(/Kedaluwarsa/)).not.toBeInTheDocument();
  });
});


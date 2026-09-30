import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntakeView } from "@/components/admin/intake-view";
import { activityTable, describeAnswers } from "@/lib/kuis/v1/describe";
import type { IntakeDetail } from "@/server/intake";
import { slimmingReturningPatient } from "../../fixtures/quiz-answers";

// IntakeView memuat formulir persetujuan, yang mengimpor server action ini.
vi.mock("@/server/intake", () => ({ approveIntakeToPatient: vi.fn() }));

const intake: IntakeDetail = {
  id: "i1",
  status: "TERISI",
  kind: "PENDEK",
  purposeLabel: "Slimming",
  submittedAt: new Date("2026-09-28T02:00:00Z"),
  appointment: { code: "SDY-8F3K", startAt: new Date("2026-10-01T07:00:00Z"), serviceName: "Konsultasi Dokter", staffName: "Dr. Diane" },
  patient: null,
  review: null,
  approval: null,
  identity: {
    name: "Siti Rahayu",
    whatsapp: "6281234567890",
    birthDateLabel: "17/04/1992",
    genderLabel: null,
    occupation: null,
    address: null,
  },
  clinical: {
    sections: describeAnswers(slimmingReturningPatient).filter((s) => s.step !== "P3"),
    activities: activityTable(slimmingReturningPatient.returning.activities),
    activityDateLabel: "Minggu, 27 September 2026",
    habits: null,
  },
};

describe("IntakeView", () => {
  it("menampilkan bagian jawaban dan status pencocokan", () => {
    render(<IntakeView intake={intake} />);
    expect(screen.getByText("Belum dicocokkan")).toBeInTheDocument();
    expect(screen.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari")).toBeInTheDocument();
  });

  it("menampilkan tabel aktivitas 06.00–22.00 dengan jam kosong tetap ada", () => {
    render(<IntakeView intake={intake} />);
    const table = screen.getByRole("table", { name: /Aktivitas Minggu, 27 September 2026/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(18); // judul + 17 jam
    expect(rows[1]).toHaveTextContent("06.00");
    expect(rows[1]).toHaveTextContent("Kapsul M");
    expect(rows[3]).toHaveTextContent("08.00");
  });

  it("menampilkan siapa yang memeriksa dan tautan ke data pasien", () => {
    render(
      <IntakeView
        intake={{
          ...intake,
          status: "DIPERIKSA",
          patient: { id: "p1", name: "Siti Rahayu", medicalRecordNumber: "SDY-2026-0001" },
          review: { reviewedAt: new Date("2026-10-01T02:00:00Z"), reviewerName: "Dr. Diane" },
        }}
      />,
    );
    expect(screen.getByText(/Diperiksa oleh Dr\. Diane/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Siti Rahayu (SDY-2026-0001)" })).toHaveAttribute("href", "/admin/pasien/p1");
  });

  it("meminta pencocokan dulu bila booking belum punya pasien", () => {
    render(<IntakeView intake={{ ...intake, approval: { state: "needs-match" } }} />);
    expect(screen.getByText(/Cocokkan booking ini dengan pasien di menu Booking/)).toBeInTheDocument();
  });
});

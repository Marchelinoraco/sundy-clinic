import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TreatmentPatientTable } from "@/components/admin/treatment-patient-table";
import type { TreatmentPatientRow } from "@/server/treatment-patients-read";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/treatment-reminder", () => ({ recordTreatmentReminder: vi.fn() }));

const row = (patch: Partial<TreatmentPatientRow>): TreatmentPatientRow => ({
  patientId: "p1",
  patientName: "Ani Kartika",
  medicalRecordNumber: "SDY-2026-0001",
  treatments: "Laser Toning",
  treatmentOn: "2026-10-03",
  intervalDays: 14,
  lastReminder: null,
  markers: [],
  message: { text: "Halo Ani", link: "https://wa.me/6281200000001?text=Halo%20Ani" },
  ...patch,
});

describe("tab Pasien treatment (spec pengingat treatment PT10, PT14)", () => {
  it("kolom, tanda, Kirim / Kirim lagi, dan tanpa WA", () => {
    renderAdmin(
      <TreatmentPatientTable
        rows={[
          row({ lastReminder: { sentAt: new Date("2026-10-10T02:00:00Z"), staffName: "Mey" }, markers: ["punya booking 25 Okt 2026"] }),
          row({ patientId: "p2", patientName: "Siti Rahayu", treatments: "Facial Brightening", treatmentOn: "2026-09-26", intervalDays: 7 }),
          row({ patientId: "p3", patientName: "Budi Tanpa WA", message: { text: "Halo", link: null } }),
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Pasien treatment" });
    const ani = within(table).getByText("Ani Kartika").closest("tr")!;
    expect(ani).toHaveTextContent("SDY-2026-0001");
    expect(ani).toHaveTextContent("punya booking 25 Okt 2026");
    expect(ani).toHaveTextContent("Laser Toning");
    expect(ani).toHaveTextContent("tiap 2 minggu");
    expect(ani).toHaveTextContent("3 Okt 2026");
    expect(ani).toHaveTextContent("10 Okt 2026 · Mey");
    expect(within(ani).getByRole("link", { name: "Kirim lagi" })).toHaveAttribute("href", "https://wa.me/6281200000001?text=Halo%20Ani");
    const siti = within(table).getByText("Siti Rahayu").closest("tr")!;
    expect(siti).toHaveTextContent("—");
    expect(within(siti).getByRole("link", { name: "Kirim" })).toBeInTheDocument();
    expect(within(table).getByText("Budi Tanpa WA").closest("tr")).toHaveTextContent("Nomor WhatsApp pasien tidak dikenali.");
  });

  it("kosong", () => {
    renderAdmin(<TreatmentPatientTable rows={[]} />);
    expect(screen.getByText("Belum ada pasien treatment.")).toBeInTheDocument();
  });
});

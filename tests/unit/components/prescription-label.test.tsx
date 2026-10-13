import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrescriptionLabel } from "@/components/admin/billing/prescription-label";

describe("PrescriptionLabel (spec resep dokter 5)", () => {
  it("etiket berisi obat, jumlah, dan aturan pakai tanpa harga", () => {
    render(
      <PrescriptionLabel
        clinicName="SunDY Clinic"
        data={{ patientName: "Ani", startAt: new Date("2026-10-13T03:00:00Z"), doctorName: "dr. Diane", lines: [{ name: "Amoxicillin", quantity: 6, usage: "2 x 1" }] }}
      />,
    );
    const label = screen.getByRole("article", { name: "Etiket obat" });
    expect(label).toHaveTextContent("SunDY Clinic");
    expect(label).toHaveTextContent("Ani");
    expect(label).toHaveTextContent("dr. Diane");
    expect(label).toHaveTextContent("Amoxicillin");
    expect(label).toHaveTextContent("Jumlah: 6");
    expect(label).toHaveTextContent("2 x 1");
    expect(label).not.toHaveTextContent("Rp");
  });
});

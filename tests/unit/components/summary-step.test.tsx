import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SummaryStep } from "@/components/pendaftaran/summary-step";
import { nutritionNewPatient } from "../../fixtures/quiz-answers-v2";

describe("SummaryStep", () => {
  it("memakai nada customer dan menampilkan form recall per layar", () => {
    render(<SummaryStep answers={nutritionNewPatient} onEdit={vi.fn()} />);
    expect(screen.getByText("Konsultasi dokter spesialis gizi klinik · pertama kali ke SunDY")).toBeInTheDocument();
    expect(screen.getByText("07.00: Nasi kuning 1 piring, teh manis 1 gelas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah Sarapan" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pasien|berobat/i);
  });
});

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROGRAM_STEPS, ProgramSteps } from "@/components/public/program-steps";
import { STEP_IMAGES } from "@/lib/site-images";
import { triggerIntersection } from "../helpers/browser-mocks";

describe("ProgramSteps", () => {
  it("menampilkan tiga langkah, dengan langkah pertama menyala", () => {
    render(<ProgramSteps headingId="cara-kerja" title="Program Slimming dalam tiga langkah" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Program Slimming dalam tiga langkah" }),
    ).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(PROGRAM_STEPS.map((step) => step.title)).toEqual([
      "Konsultasi dokter",
      "Timbang BIA & meal plan",
      "Kontrol mingguan",
    ]);
    expect(steps[0]).toHaveAttribute("data-active", "true");
    expect(steps[1]).toHaveAttribute("data-active", "false");
  });

  it("menyalakan langkah yang melintasi tengah layar dan mengganti foto yang menempel", () => {
    render(<ProgramSteps headingId="cara-kerja" title="Cara kerja program" />);
    const steps = screen.getAllByRole("listitem");

    act(() => triggerIntersection(steps[1], true));
    expect(steps[1]).toHaveAttribute("data-active", "true");
    expect(steps[0]).toHaveAttribute("data-active", "false");

    // Foto di kartu ponsel selalu berteks alternatif; foto menempel desktop hanya untuk langkah aktif.
    expect(screen.getAllByAltText(STEP_IMAGES.timbang.alt)).toHaveLength(2);
    expect(screen.getAllByAltText(STEP_IMAGES.konsultasi.alt)).toHaveLength(1);
  });

  it("menautkan ke Program Slimming hanya bila diminta", () => {
    const { rerender } = render(<ProgramSteps headingId="cara-kerja" title="Cara kerja program" />);
    expect(screen.queryByRole("link", { name: "Lihat paket Program Slimming" })).not.toBeInTheDocument();

    rerender(<ProgramSteps headingId="cara-kerja" title="Cara kerja program" showProgramLink />);
    expect(screen.getByRole("link", { name: "Lihat paket Program Slimming" })).toHaveAttribute(
      "href",
      "/program-slimming",
    );
  });
});

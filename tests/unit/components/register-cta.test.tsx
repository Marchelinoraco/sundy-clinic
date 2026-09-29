import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegisterCta } from "@/components/layout/register-cta";

describe("RegisterCta", () => {
  it("mengarah ke halaman pendaftaran", () => {
    render(<RegisterCta />);
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
  });
});

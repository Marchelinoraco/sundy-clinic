import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPolicyPage from "@/app/(public)/kebijakan-privasi/page";

describe("halaman Kebijakan Privasi", () => {
  it("menyebut versi yang disetujui pasien saat mendaftar", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/Versi 28 September 2026/)).toBeInTheDocument();
  });

  it("menjelaskan kuis pendaftaran dan biaya booking", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole("heading", { name: "Kuis pendaftaran" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Biaya booking" })).toBeInTheDocument();
  });
});

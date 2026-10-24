import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPolicyPage from "@/app/(public)/kebijakan-privasi/page";

describe("halaman Kebijakan Privasi", () => {
  it("menyebut versi yang disetujui pasien saat mendaftar", () => {
    render(<PrivacyPolicyPage />);
    // Naik saat aturan biaya booking menjadi deposit (spec deposit D13; pemilik, 24 Okt 2026).
    expect(screen.getByText(/Versi 24 Oktober 2026/)).toBeInTheDocument();
  });

  it("menjelaskan kuis pendaftaran dan biaya booking", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole("heading", { name: "Kuis pendaftaran" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Biaya booking" })).toBeInTheDocument();
  });

  it("biaya booking menjadi deposit yang dipotong dari tagihan dan hangus bila batal (spec deposit D13)", () => {
    render(<PrivacyPolicyPage />);
    const section = screen.getByRole("heading", { name: "Biaya booking" }).parentElement!;
    expect(section).toHaveTextContent("Biaya ini menjadi deposit yang dipotong dari tagihan saat Anda berkunjung");
    expect(section).not.toHaveTextContent("tidak dikembalikan");
  });
});

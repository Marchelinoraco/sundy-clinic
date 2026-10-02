import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DoctorProfile, doctorCallName } from "@/components/public/doctor-profile";

const DIANE = {
  name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
  specialty: "Spesialis Gizi Klinik",
  bio: "Dokter penanggung jawab SunDY Clinic Manado untuk program slimming, nutrisi, dan perawatan estetika.",
  role: "DOKTER",
};
const PHOTO = { src: "/images/dokter/diane-2.jpg", alt: "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic" };

describe("doctorCallName", () => {
  it("memendekkan nama bergelar menjadi sapaan untuk tombol", () => {
    expect(doctorCallName("Dr. Diane Paparang, Sp.GK, AIFO-K")).toBe("dr. Diane");
    expect(doctorCallName("dr. Budi Santoso")).toBe("dr. Budi");
    expect(doctorCallName("Dr.Diane Paparang")).toBe("dr. Diane");
    expect(doctorCallName("Drajat Wibowo")).toBe("dr. Drajat");
  });
});

describe("DoctorProfile", () => {
  it("menampilkan foto, nama, gelar, profil, dan ajakan konsultasi", () => {
    render(<DoctorProfile person={DIANE} photo={PHOTO} eyebrow="Kenali dokter Anda" />);
    expect(screen.getByRole("img", { name: PHOTO.alt })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: DIANE.name })).toBeInTheDocument();
    expect(screen.getByText(DIANE.specialty)).toBeInTheDocument();
    expect(screen.getByText(DIANE.bio)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Konsultasi dengan dr. Diane" })).toHaveAttribute("href", "/daftar");
  });

  it("tidak menawarkan konsultasi dokter untuk terapis", () => {
    render(<DoctorProfile person={{ ...DIANE, name: "Terapis Sari", role: "TERAPIS" }} photo={null} />);
    expect(screen.queryByRole("link", { name: /Konsultasi dengan/ })).not.toBeInTheDocument();
  });

  it("tetap tampil tanpa foto, dengan tingkat judul yang diminta", () => {
    render(<DoctorProfile person={DIANE} photo={null} headingLevel={3} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: DIANE.name })).toBeInTheDocument();
  });
});

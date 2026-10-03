import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AboutPage from "@/app/(public)/tentang/page";
import { CLINIC_GALLERY } from "@/lib/site-images";

const DIANE = {
  id: "d1",
  slug: "diane-paparang",
  name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
  specialty: "Spesialis Gizi Klinik",
  bio: "Dokter penanggung jawab SunDY Clinic Manado.",
  role: "DOKTER",
  photoUrl: null,
};
const DIANE_ALT = "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic";

const catalog = vi.hoisted(() => ({ team: [] as unknown[] }));
vi.mock("@/server/catalog", () => ({ getPublicStaff: async () => catalog.team }));

describe("halaman Tentang", () => {
  it("menampilkan cerita, angka, dr. Diane, galeri suasana, dan jam praktik", async () => {
    catalog.team = [DIANE];
    render(await AboutPage());

    expect(screen.getByRole("heading", { level: 1, name: "Tentang SunDY" })).toBeInTheDocument();
    // Foto 1 di kepala halaman, foto 2 di profil dokter.
    expect(screen.getAllByRole("img", { name: DIANE_ALT })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Cerita kami" })).toBeInTheDocument();
    expect(screen.getByText("700+ customer")).toBeInTheDocument();
    expect(screen.getByText("Sejak 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Tim Dokter" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: DIANE.name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Konsultasi dengan dr. Diane" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("heading", { name: "Tenang, bersih, dan nyaman" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Jam Praktik" })).toBeInTheDocument();
  });

  it("tetap tampil tanpa dokter yang ditampilkan di situs", async () => {
    catalog.team = [];
    render(await AboutPage());

    expect(screen.queryByRole("heading", { name: "Tim Dokter" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Diane/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: CLINIC_GALLERY[0].alt }).length).toBeGreaterThan(0);
  });
});

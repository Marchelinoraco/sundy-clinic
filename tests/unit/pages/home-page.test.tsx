import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(public)/page";

const DIANE = {
  id: "d1",
  slug: "diane-paparang",
  name: "Dr. Diane Paparang, Sp.GK, AIFO-K",
  specialty: "Spesialis Gizi Klinik",
  bio: "Dokter penanggung jawab SunDY Clinic Manado.",
  role: "DOKTER",
  photoUrl: null,
};

const catalog = vi.hoisted(() => ({ team: [] as unknown[] }));

vi.mock("@/server/catalog", () => ({
  getSignatureServices: async () => [
    {
      id: "s1",
      slug: "hifu-wajah",
      name: "HIFU Wajah",
      description: "Mengencangkan kulit.",
      normalPrice: 749000,
      promoPrice: 499000,
      priceNote: null,
      imageUrl: null,
      category: { slug: "hifu", name: "HIFU Treatment" },
    },
  ],
  getBranches: async () => [
    {
      id: "b1",
      slug: "mahakeret",
      name: "SunDY Mahakeret",
      address: "Jl. Garuda No. 10, Mahakeret Barat, Manado",
      openingHours: "Senin–Sabtu, 11.00–19.00",
      status: "AKTIF",
      mapsUrl: null,
    },
  ],
  getPublicStaff: async () => catalog.team,
  countActiveServices: async () => 35,
}));

describe("Beranda", () => {
  it("menampilkan sepuluh bagian, termasuk dr. Diane", async () => {
    catalog.team = [DIANE];
    render(await HomePage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("SunDY");
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Beauty, Our Priority" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Program Slimming dalam tiga langkah" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our Signature Treatment" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HIFU Wajah" })).toHaveAttribute("href", "/layanan/hifu-wajah");
    expect(screen.getByRole("link", { name: "Konsultasi dengan dr. Diane" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("heading", { name: "Tenang, bersih, dan nyaman" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lokasi Kami" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "SunDY Mahakeret" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mulai perjalanan sehat Anda" })).toBeInTheDocument();
  });

  it("tetap tampil tanpa dokter yang ditampilkan di situs", async () => {
    catalog.team = [];
    render(await HomePage());

    expect(screen.queryByRole("link", { name: /Konsultasi dengan/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Diane/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our Signature Treatment" })).toBeInTheDocument();
  });
});

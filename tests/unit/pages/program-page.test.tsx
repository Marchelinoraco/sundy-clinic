import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SlimmingProgramPage from "@/app/(public)/program-slimming/page";

function pkg(slug: string, name: string, groupName: string) {
  return {
    id: slug,
    slug,
    name,
    groupName,
    monthlyPrice: 1125000,
    description: null,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [{ id: `${slug}-1`, packageId: slug, label: "Konsul & Timbang BIA", sortOrder: 1 }],
  };
}

vi.mock("@/server/catalog", () => ({
  getPackagesByGroup: async () => [
    { groupName: "MAX", packages: [pkg("max", "MAX", "MAX")] },
    { groupName: "LUX", packages: [pkg("lux", "LUX", "LUX")] },
    { groupName: "ACTIVE", packages: [pkg("lux-t-active", "LUX T ACTIVE", "ACTIVE")] },
  ],
  getServiceCategoriesWithServices: async () => [
    {
      id: "c-slimming",
      slug: "slimming",
      name: "Slimming & Wellness",
      description: null,
      services: [
        { id: "s1", slug: "konsultasi-dokter", name: "Konsultasi Dokter", description: null, normalPrice: null, promoPrice: 150000, priceNote: null, imageUrl: null },
      ],
    },
  ],
}));

const page = (paket?: string | string[]) =>
  SlimmingProgramPage({ searchParams: Promise.resolve(paket === undefined ? {} : { paket }) });

describe("halaman Program Slimming", () => {
  it("membuka MAX bila tidak ada ?paket=", async () => {
    render(await page());
    expect(screen.getByRole("tab", { name: "MAX" })).toHaveAttribute("aria-selected", "true");
  });

  it("membuka kelompok dari ?paket=, termasuk huruf besar-kecil yang campur", async () => {
    render(await page("LuX"));
    expect(screen.getByRole("tab", { name: "LUX" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Paket LUX" })).toBeVisible();
  });

  it("kembali ke MAX untuk ?paket= yang tidak dikenal", async () => {
    render(await page("premium"));
    expect(screen.getByRole("tab", { name: "MAX" })).toHaveAttribute("aria-selected", "true");
  });

  it("memuat cara kerja, layanan satuan, Nutrigenomics, dan ajakan akhir", async () => {
    render(await page());
    expect(screen.getByRole("heading", { name: "Cara kerja program" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Konsultasi Dokter" })).toHaveAttribute("href", "/layanan/konsultasi-dokter");
    expect(screen.getByText(/Nutrigenomics Program/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mulai perjalanan sehat Anda" })).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ServiceDetailPage from "@/app/(public)/layanan/[slug]/page";
import ServicesPage from "@/app/(public)/layanan/page";

const HIFU_CATEGORY = { id: "c-hifu", slug: "hifu", name: "HIFU Treatment", description: null, sortOrder: 4 };

function service(slug: string, name: string, promoPrice: number, normalPrice: number | null) {
  return {
    id: `s-${slug}`,
    slug,
    name,
    description: null,
    normalPrice,
    promoPrice,
    priceNote: null,
    durationMin: 90,
    imageUrl: null,
    categoryId: HIFU_CATEGORY.id,
  };
}

const HIFU_WAJAH = { ...service("hifu-wajah", "HIFU Wajah", 499000, 749000), category: HIFU_CATEGORY };
const catalog = vi.hoisted(() => ({ related: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/server/catalog", () => ({
  getServiceCategoriesWithServices: async () => [
    { ...HIFU_CATEGORY, services: [service("hifu-wajah", "HIFU Wajah", 499000, 749000), service("hifu-perut", "HIFU Perut", 699000, 1000000)] },
    { id: "c-rf", slug: "rf", name: "RF Treatment", description: null, sortOrder: 3, services: [service("rf-wajah", "RF Wajah", 199000, null)] },
  ],
  getServiceBySlug: async (slug: string) => (slug === "hifu-wajah" ? HIFU_WAJAH : null),
  getRelatedServices: async () => catalog.related,
  getAllServiceSlugs: async () => ["hifu-wajah"],
}));

describe("halaman Layanan & Harga", () => {
  it("menampilkan jumlah treatment, chip kategori, dan bagian per kategori yang bisa dituju", async () => {
    render(await ServicesPage());
    expect(screen.getByRole("heading", { level: 1, name: "Layanan & Harga" })).toBeInTheDocument();
    expect(screen.getByText("3 treatment · harga promo berlaku")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Kategori layanan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RF Treatment" })).toHaveAttribute("href", "#bagian-rf");
    expect(document.getElementById("bagian-rf")).toHaveAttribute("data-category", "rf");
    expect(screen.getByRole("link", { name: "HIFU Wajah" })).toHaveAttribute("href", "/layanan/hifu-wajah");
  });
});

describe("halaman detail layanan", () => {
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

  it("menampilkan harga, durasi, kategori, dan kedua tombol di kepala halaman", async () => {
    render(await ServiceDetailPage(params("hifu-wajah")));
    expect(screen.getByRole("heading", { level: 1, name: "HIFU Wajah" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Remah roti" })).toHaveTextContent("Layanan · HIFU Treatment");
    expect(screen.getByText("Rp 749.000")).toBeInTheDocument();
    expect(screen.getByText("90 menit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("link", { name: "Tanya via WhatsApp" }).getAttribute("href")).toContain("wa.me/");
    expect(document.querySelector("[data-sticky-booking-bar]")).not.toBeNull();
  });

  it("menawarkan treatment lain di kategori yang sama", async () => {
    catalog.related = [service("hifu-miss-v", "HIFU Miss V", 489000, 649000)];
    render(await ServiceDetailPage(params("hifu-wajah")));
    expect(screen.getByRole("heading", { level: 2, name: "Treatment lain di HIFU Treatment" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HIFU Miss V" })).toHaveAttribute("href", "/layanan/hifu-miss-v");
  });

  it("tidak menampilkan bagian treatment lain bila kategori hanya punya satu layanan", async () => {
    catalog.related = [];
    render(await ServiceDetailPage(params("hifu-wajah")));
    expect(screen.queryByRole("heading", { name: /Treatment lain/ })).not.toBeInTheDocument();
  });

  it("menolak slug yang tidak ada", async () => {
    await expect(ServiceDetailPage(params("tidak-ada"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

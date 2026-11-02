import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServiceCard } from "@/components/catalog/service-card";

const HIFU = {
  slug: "hifu-wajah",
  name: "HIFU Wajah",
  description: "Mengencangkan kulit dan mengurangi garis halus.",
  normalPrice: 749000,
  promoPrice: 499000,
  priceNote: null,
  imageUrl: null,
};

const HIFU_CATEGORY = { slug: "hifu", name: "HIFU Treatment", imageUrl: null };

function imageSrc(container: HTMLElement): string {
  return decodeURIComponent(container.querySelector("img")?.getAttribute("src") ?? "");
}

describe("ServiceCard", () => {
  it("menautkan nama layanan ke halaman detailnya, dengan harga coret dan harga promo", () => {
    render(<ServiceCard service={HIFU} category={HIFU_CATEGORY} />);
    expect(screen.getByRole("link", { name: "HIFU Wajah" })).toHaveAttribute("href", "/layanan/hifu-wajah");
    expect(screen.getByText("Rp 749.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 499.000")).toBeInTheDocument();
  });

  it("memakai foto kategori bila layanan belum punya foto sendiri", () => {
    const { container } = render(<ServiceCard service={HIFU} category={HIFU_CATEGORY} />);
    expect(imageSrc(container)).toContain("/images/stok/kategori-hifu.jpg");
  });

  it("mendahulukan foto layanan sendiri", () => {
    const { container } = render(
      <ServiceCard service={{ ...HIFU, imageUrl: "/images/layanan/hifu.jpg" }} category={HIFU_CATEGORY} />,
    );
    expect(imageSrc(container)).toContain("/images/layanan/hifu.jpg");
  });

  it("menganggap foto kartu sebagai hiasan, karena nama layanan sudah ada di judul", () => {
    const { container } = render(<ServiceCard service={HIFU} category={HIFU_CATEGORY} />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("memakai foto kategori unggahan untuk kategori baru (spec kategori layanan KL9)", () => {
    const { container } = render(<ServiceCard service={HIFU} category={{ slug: "baru", name: "Hair", imageUrl: "/foto-kategori/c1-0123abcd.webp" }} />);
    expect(imageSrc(container)).toContain("/foto-kategori/c1-0123abcd.webp");
  });
});

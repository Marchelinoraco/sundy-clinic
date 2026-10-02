import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductCard } from "@/components/catalog/product-card";

const KAPSUL = {
  slug: "kapsul-m",
  name: "Kapsul M",
  description: "Kapsul pendukung program slimming.",
  price: null,
  imageUrl: null,
};

describe("ProductCard", () => {
  it("memakai foto stok produk bila produk belum punya foto", () => {
    const { container } = render(<ProductCard product={KAPSUL} />);
    const src = decodeURIComponent(container.querySelector("img")?.getAttribute("src") ?? "");
    expect(src).toContain("/images/stok/produk.jpg");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("menautkan pemesanan ke WhatsApp dengan nama produk terisi", () => {
    render(<ProductCard product={KAPSUL} />);
    const href = screen.getByRole("link", { name: "Pesan via WhatsApp" }).getAttribute("href") ?? "";
    expect(href).toContain("wa.me/6285172228900");
    expect(decodeURIComponent(href)).toContain("Kapsul M");
  });

  it("meminta menghubungi klinik bila harga belum ada", () => {
    render(<ProductCard product={KAPSUL} />);
    expect(screen.getByText("Hubungi kami untuk harga")).toBeInTheDocument();
  });
});

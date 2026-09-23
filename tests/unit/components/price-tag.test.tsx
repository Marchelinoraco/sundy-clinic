import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceTag } from "@/components/catalog/price-tag";

describe("PriceTag", () => {
  it("mencoret harga normal dan menonjolkan harga promo", () => {
    render(<PriceTag normalPrice={749000} promoPrice={499000} />);

    const normal = screen.getByText("Rp 749.000");
    expect(normal.tagName).toBe("S");
    expect(screen.getByText("Rp 499.000")).toBeInTheDocument();
  });

  it("menyembunyikan harga coret bila tidak ada", () => {
    render(<PriceTag normalPrice={null} promoPrice={50000} priceNote="/ unit" />);

    expect(screen.queryByText(/^Rp 749/)).not.toBeInTheDocument();
    expect(screen.getByText("Rp 50.000 / unit")).toBeInTheDocument();
  });

  it("memberi tahu pembaca layar bahwa harga coret adalah harga lama", () => {
    render(<PriceTag normalPrice={749000} promoPrice={499000} />);
    expect(screen.getByText("Harga normal:")).toHaveClass("sr-only");
  });
});

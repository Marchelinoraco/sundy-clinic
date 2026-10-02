import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PackageCard } from "@/components/catalog/package-card";

const MAX_SLIM = {
  slug: "max-slim",
  name: "MAX SLIM",
  monthlyPrice: 1925000,
  items: [
    { id: "1", label: "Konsul & Timbang BIA" },
    { id: "2", label: "Kapsul M" },
    { id: "3", label: "Fat Blocker" },
    { id: "4", label: "Inject S" },
  ],
};

describe("PackageCard", () => {
  it("menampilkan nama, harga per bulan, dan seluruh isi paket", () => {
    render(<PackageCard pkg={MAX_SLIM} />);
    expect(screen.getByRole("heading", { level: 3, name: "MAX SLIM" })).toBeInTheDocument();
    expect(screen.getByText("Rp 1.925.000")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      MAX_SLIM.items.map((item) => item.label),
    );
  });

  it("memunculkan isi paket bergiliran", () => {
    render(<PackageCard pkg={MAX_SLIM} />);
    const delays = screen.getAllByRole("listitem").map((item) => item.style.animationDelay);
    expect(delays).toEqual(["150ms", "210ms", "270ms", "330ms"]);
  });
});

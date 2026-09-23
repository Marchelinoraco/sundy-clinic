import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BranchCard } from "@/components/catalog/branch-card";

const active = {
  slug: "mahakeret",
  name: "SunDY Mahakeret",
  address: "Jl. Garuda No. 10, Mahakeret Barat, Manado",
  openingHours: "Senin–Sabtu, 11.00–19.00",
  status: "AKTIF" as const,
  mapsUrl: "https://maps.google.com/?q=SunDY+Mahakeret",
};

const comingSoon = {
  slug: "citraland",
  name: "SunDY Citraland",
  address: "Citraland — Cluster The Manhattan, Manado",
  openingHours: "Senin–Sabtu, 11.00–19.00",
  status: "SEGERA_HADIR" as const,
  mapsUrl: null,
};

describe("BranchCard", () => {
  it("menampilkan alamat dan jam operasional", () => {
    render(<BranchCard branch={active} />);
    expect(screen.getByText(active.address)).toBeInTheDocument();
    expect(screen.getByText(/Senin–Sabtu, 11.00–19.00/)).toBeInTheDocument();
  });

  it("menawarkan petunjuk arah pada cabang aktif", () => {
    render(<BranchCard branch={active} />);
    expect(screen.getByRole("link", { name: /petunjuk arah/i })).toHaveAttribute(
      "href",
      active.mapsUrl,
    );
  });

  it("menandai cabang yang belum buka sebagai Segera Hadir", () => {
    render(<BranchCard branch={comingSoon} />);
    expect(screen.getByText("Segera Hadir")).toBeInTheDocument();
  });

  it("menawarkan pemberitahuan lewat WhatsApp pada cabang yang belum buka", () => {
    render(<BranchCard branch={comingSoon} />);
    const link = screen.getByRole("link", { name: /beri tahu saya saat buka/i });
    expect(link.getAttribute("href")).toContain("wa.me/6285172228900");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain("SunDY Citraland");
  });

  it("tidak menawarkan petunjuk arah pada cabang yang belum buka", () => {
    render(<BranchCard branch={comingSoon} />);
    expect(screen.queryByRole("link", { name: /petunjuk arah/i })).not.toBeInTheDocument();
  });

  it("tidak menawarkan petunjuk arah bila cabang aktif belum punya titik peta", () => {
    render(<BranchCard branch={{ ...active, mapsUrl: null }} />);
    expect(screen.queryByRole("link", { name: /petunjuk arah/i })).not.toBeInTheDocument();
  });
});

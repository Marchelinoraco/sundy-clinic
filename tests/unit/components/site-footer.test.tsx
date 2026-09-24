import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/layout/site-footer";

describe("SiteFooter", () => {
  it("menampilkan nomor WhatsApp klinik dalam format lokal", () => {
    render(<SiteFooter />);
    expect(screen.getByText("0851-7222-8900")).toBeInTheDocument();
  });

  it("menautkan ke Instagram klinik", () => {
    render(<SiteFooter />);
    const link = screen.getByRole("link", { name: /sundyclinic/i });
    expect(link).toHaveAttribute("href", "https://instagram.com/sundyclinic");
  });

  it("menyebut jam operasional dan hari tutup", () => {
    render(<SiteFooter />);
    expect(screen.getByText(/Senin–Sabtu, 11.00–19.00 WITA/)).toBeInTheDocument();
    expect(screen.getByText(/Minggu dan hari libur nasional tutup/)).toBeInTheDocument();
  });
});

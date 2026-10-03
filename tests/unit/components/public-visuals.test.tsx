import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArchImage } from "@/components/public/arch-image";
import { FloatingChip } from "@/components/public/floating-chip";
import { MorphBlob } from "@/components/public/morph-blob";
import { PageHero } from "@/components/public/page-hero";

const PHOTO = { src: "/images/stok/suasana-3.jpg", alt: "Rak produk perawatan kulit di lorong yang terang" };

describe("bahan visual situs publik", () => {
  it("menyembunyikan bentuk emas dari pembaca layar", () => {
    const { container } = render(<MorphBlob className="h-40 w-40" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".morph-blob__part")).toHaveLength(3);
  });

  it("menampilkan foto lengkung dengan teks alternatif, dan naik dari bingkai bila diminta", () => {
    const { container } = render(<ArchImage image={PHOTO} sizes="200px" rise className="w-40" />);
    expect(screen.getByRole("img", { name: PHOTO.alt })).toBeInTheDocument();
    expect(container.querySelector(".arch-rise")).not.toBeNull();
  });

  it("tidak menaikkan foto lengkung di bawah layar", () => {
    const { container } = render(<ArchImage image={PHOTO} sizes="200px" />);
    expect(container.querySelector(".arch-rise")).toBeNull();
  });

  it("menjadikan kartu kecil melayang dengan jeda yang diminta", () => {
    render(<FloatingChip delayMs={1200}>700+ customer</FloatingChip>);
    const chip = screen.getByText("700+ customer");
    expect(chip).toHaveClass("float-y");
    expect(chip.style.animationDelay).toBe("1200ms");
  });

  it("menampilkan kepala halaman dengan judul h1, deskripsi, tombol, dan foto yang dimuat lebih dulu", () => {
    render(
      <PageHero title="Layanan & Harga" description={<p>35 treatment · harga promo berlaku</p>} image={PHOTO}>
        <a href="/daftar">Daftar Konsultasi</a>
      </PageHero>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Layanan & Harga" })).toBeInTheDocument();
    expect(screen.getByText("35 treatment · harga promo berlaku")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: PHOTO.alt })).not.toHaveAttribute("loading", "lazy");
  });

  it("tetap rapi tanpa foto", () => {
    render(<PageHero title="Tanya Jawab" />);
    expect(screen.getByRole("heading", { level: 1, name: "Tanya Jawab" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

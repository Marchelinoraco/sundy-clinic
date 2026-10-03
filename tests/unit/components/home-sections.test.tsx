import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HERO_TITLE_LINES, HomeHero } from "@/components/home/home-hero";
import { StatsStrip } from "@/components/home/stats-strip";
import { ClinicGallery } from "@/components/public/clinic-gallery";
import { FinalCta } from "@/components/public/final-cta";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { CLINIC_GALLERY } from "@/lib/site-images";

const DOCTOR = { name: "Dr. Diane Paparang, Sp.GK, AIFO-K", specialty: "Spesialis Gizi Klinik" };
const PORTRAIT = {
  src: "/images/dokter/diane-1.jpg",
  alt: "dr. Diane Paparang, Sp.GK, AIFO-K, dokter SunDY Clinic",
};

describe("HomeHero", () => {
  it("memakai nama lengkap klinik sebagai judul, dipecah per baris", () => {
    expect(HERO_TITLE_LINES.join(" ")).toBe(CLINIC_FULL_NAME.replace(" —", ""));
    render(<HomeHero doctor={DOCTOR} photo={PORTRAIT} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "SunDY Nutrition, Slimming & Wellness Clinic",
    );
  });

  it("menampilkan foto dr. Diane yang dimuat paling dulu, kartu dokter, dan kartu 700+ customer", () => {
    render(<HomeHero doctor={DOCTOR} photo={PORTRAIT} />);
    expect(screen.getByRole("img", { name: PORTRAIT.alt })).not.toHaveAttribute("loading", "lazy");
    expect(screen.getByText(DOCTOR.name)).toBeInTheDocument();
    expect(screen.getByText(DOCTOR.specialty)).toBeInTheDocument();
    expect(screen.getByText("700+")).toBeInTheDocument();
  });

  it("mengajak mendaftar, ke Program Slimming, dan ke daftar layanan", () => {
    render(<HomeHero doctor={DOCTOR} photo={PORTRAIT} />);
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("link", { name: "Program Slimming" })).toHaveAttribute("href", "/program-slimming");
    expect(screen.getByRole("link", { name: "Lihat Layanan & Harga" })).toHaveAttribute("href", "/layanan");
  });

  it("tetap tampil tanpa dokter: foto suasana, tanpa kartu dokter", () => {
    render(<HomeHero doctor={null} photo={null} />);
    expect(screen.getByRole("img", { name: CLINIC_GALLERY[0].alt })).toBeInTheDocument();
    expect(screen.queryByText(/Diane/)).not.toBeInTheDocument();
    expect(screen.getByText("700+")).toBeInTheDocument();
  });
});

describe("StatsStrip", () => {
  it("menampilkan customer, tahun berdiri, jumlah treatment, dan jam buka", () => {
    render(<StatsStrip treatmentCount={35} />);
    expect(screen.getByText("700+")).toBeInTheDocument();
    expect(screen.getByText("customer")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("tahun berdiri")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("pilihan treatment")).toBeInTheDocument();
    expect(screen.getByText("11.00–19.00")).toBeInTheDocument();
    expect(screen.getByText("Senin–Sabtu · WITA")).toBeInTheDocument();
  });
});

describe("ClinicGallery", () => {
  it("menampilkan tiga foto suasana berteks alternatif di bawah judulnya", () => {
    render(<ClinicGallery headingId="suasana" />);
    expect(screen.getByRole("region", { name: "Tenang, bersih, dan nyaman" })).toBeInTheDocument();
    for (const image of CLINIC_GALLERY) {
      expect(screen.getByRole("img", { name: image.alt })).toBeInTheDocument();
    }
  });
});

describe("FinalCta", () => {
  it("mengajak mendaftar dan chat WhatsApp", () => {
    render(<FinalCta />);
    expect(screen.getByRole("heading", { level: 2, name: "Mulai perjalanan sehat Anda" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    const whatsapp = screen.getByRole("link", { name: "Chat WhatsApp" });
    expect(whatsapp.getAttribute("href")).toContain("wa.me/6285172228900");
    // Uji e2e mencari tombol melayang lewat /chat via whatsapp/i; nama tombol ini tidak boleh ikut cocok.
    expect(whatsapp).not.toHaveAccessibleName(/chat via whatsapp/i);
  });
});

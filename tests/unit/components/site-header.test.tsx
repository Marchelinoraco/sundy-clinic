import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeaderShell, headerStartsSolid } from "@/components/layout/header-shell";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { isActivePath, MOBILE_NAV, PRIMARY_NAV } from "@/components/layout/nav-items";
import { NavLinks } from "@/components/layout/nav-links";
import { SiteHeader } from "@/components/layout/site-header";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

// Tautan Next membutuhkan router aplikasi; di sini cukup <a> yang tidak benar-benar berpindah halaman.
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

afterEach(() => {
  navigation.pathname = "/";
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("isActivePath", () => {
  it("menandai halaman itu dan halaman turunannya saja", () => {
    expect(isActivePath("/layanan", "/layanan")).toBe(true);
    expect(isActivePath("/layanan/hifu-wajah", "/layanan")).toBe(true);
    expect(isActivePath("/layanan-baru", "/layanan")).toBe(false);
    expect(isActivePath("/layanan", "/")).toBe(false);
    expect(isActivePath("/", "/")).toBe(true);
  });
});

describe("headerStartsSolid", () => {
  it("langsung krem di halaman tanpa kepala halaman berwarna", () => {
    expect(headerStartsSolid("/daftar")).toBe(true);
    expect(headerStartsSolid("/cek-booking")).toBe(true);
    expect(headerStartsSolid("/isi")).toBe(true);
    expect(headerStartsSolid("/kebijakan-privasi")).toBe(true);
    expect(headerStartsSolid("/syarat-ketentuan")).toBe(true);
    expect(headerStartsSolid("/")).toBe(false);
    expect(headerStartsSolid("/layanan/hifu-wajah")).toBe(false);
    expect(headerStartsSolid("/daftarkan")).toBe(false);
  });
});

describe("HeaderShell", () => {
  it("transparan di atas hero lalu krem setelah digulir lebih dari 40 px", () => {
    render(
      <HeaderShell>
        <span>Isi</span>
      </HeaderShell>,
    );
    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("data-solid", "false");

    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    fireEvent.scroll(window);
    expect(header).toHaveAttribute("data-solid", "true");

    Object.defineProperty(window, "scrollY", { configurable: true, value: 10 });
    fireEvent.scroll(window);
    expect(header).toHaveAttribute("data-solid", "false");
  });

  it("langsung krem di halaman kuis", () => {
    navigation.pathname = "/daftar";
    render(
      <HeaderShell>
        <span>Isi</span>
      </HeaderShell>,
    );
    expect(screen.getByRole("banner")).toHaveAttribute("data-solid", "true");
  });
});

describe("NavLinks", () => {
  it("menandai menu halaman yang sedang dibuka", () => {
    navigation.pathname = "/layanan/hifu-wajah";
    render(<NavLinks links={PRIMARY_NAV} />);
    expect(screen.getByRole("link", { name: "Layanan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Produk" })).not.toHaveAttribute("aria-current");
  });
});

describe("MobileMenu", () => {
  it("membuka panel berisi semua menu, Daftar Konsultasi, dan WhatsApp, lalu menutup saat tautan diklik", async () => {
    const user = userEvent.setup();
    render(<MobileMenu links={MOBILE_NAV} />);

    await user.click(screen.getByRole("button", { name: "Buka menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    for (const item of MOBILE_NAV) {
      expect(within(dialog).getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
    expect(within(dialog).getByRole("link", { name: "Beranda" })).toHaveAttribute("aria-current", "page");
    expect(within(dialog).getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    expect(within(dialog).getByRole("link", { name: /WhatsApp 0851-7222-8900/ }).getAttribute("href")).toContain(
      "wa.me/6285172228900",
    );

    await user.click(within(dialog).getByRole("link", { name: "Produk" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("menutup panel dengan Esc dan dengan tombol tutup", async () => {
    const user = userEvent.setup();
    render(<MobileMenu links={MOBILE_NAV} />);

    await user.click(screen.getByRole("button", { name: "Buka menu" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Buka menu" }));
    await user.click(screen.getByRole("button", { name: "Tutup menu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("SiteHeader", () => {
  it("memuat logo ke beranda, menu utama, tombol daftar, dan tombol menu ponsel", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: /beranda$/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("navigation", { name: "Navigasi utama" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daftar Konsultasi" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("link", { name: "Daftar" })).toHaveAttribute("href", "/daftar");
    expect(screen.getByRole("button", { name: "Buka menu" })).toBeInTheDocument();
  });
});

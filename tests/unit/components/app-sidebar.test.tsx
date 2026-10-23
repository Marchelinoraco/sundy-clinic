import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { renderAdmin } from "../helpers/render-admin";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/admin/booking/baru" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));

const staff = { userId: "u1", staffId: "s1", name: "Rina Resepsionis", role: "RESEPSIONIS" as const, email: "rina@sundy.test" };

describe("menu samping", () => {
  it("Deposit untuk Resepsionis dan Admin Keuangan, tidak untuk Apoteker (spec deposit D18)", () => {
    const first = renderAdmin(<AppSidebar staff={staff} />);
    expect(screen.getByRole("link", { name: "Deposit" })).toHaveAttribute("href", "/admin/deposit");
    first.unmount();
    const second = renderAdmin(<AppSidebar staff={{ ...staff, role: "ADMIN_KEUANGAN" }} />);
    expect(screen.getByRole("link", { name: "Deposit" })).toBeInTheDocument();
    second.unmount();
    renderAdmin(<AppSidebar staff={{ ...staff, role: "APOTEKER" }} />);
    expect(screen.queryByRole("link", { name: "Deposit" })).toBeNull();
  });

  it("menu sesuai peran, menu aktif bertanda, lencana di luar tautan dengan label lengkap", () => {
    renderAdmin(<AppSidebar staff={staff} pendingBookings={3} billable={2} />);
    expect(screen.getByRole("link", { name: "SunDY Clinic" })).toHaveAttribute("href", "/admin");
    const booking = screen.getByRole("link", { name: "Booking" });
    expect(booking).toHaveAttribute("href", "/admin/booking");
    expect(booking).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dasbor" })).not.toHaveAttribute("aria-current");
    expect(screen.getByLabelText("3 booking menunggu konfirmasi")).toHaveTextContent("3");
    expect(screen.getByLabelText("2 kunjungan perlu ditagih")).toHaveTextContent("2");
    expect(screen.queryByRole("link", { name: "Stok" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Staf" })).toBeNull();
  });

  it("Stok meja untuk resepsionis, dengan lencana; tidak untuk Admin Keuangan (spec stok meja 4.1)", () => {
    pathname.value = "/admin";
    const { unmount } = renderAdmin(<AppSidebar staff={staff} counterAlerts={2} />);
    expect(screen.getByRole("link", { name: "Stok meja" })).toHaveAttribute("href", "/admin/stok-meja");
    expect(screen.getByLabelText("2 barang meja menipis atau habis")).toHaveTextContent("2");
    unmount();
    renderAdmin(<AppSidebar staff={{ ...staff, role: "ADMIN_KEUANGAN" }} />);
    expect(screen.queryByRole("link", { name: "Stok meja" })).toBeNull();
  });

  it("menu Stok tidak ikut aktif di halaman Stok obat; lencana nol tidak tampil", () => {
    pathname.value = "/admin/stok-dokter";
    renderAdmin(<AppSidebar staff={{ ...staff, role: "DOKTER" }} pendingBookings={0} />);
    expect(screen.getByRole("link", { name: "Stok obat" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByLabelText("0 booking menunggu konfirmasi")).toBeNull();
  });
});

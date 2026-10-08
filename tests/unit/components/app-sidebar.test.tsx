import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { renderAdmin } from "../helpers/render-admin";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/admin/booking/baru" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));

const staff = { userId: "u1", staffId: "s1", name: "Rina Resepsionis", role: "RESEPSIONIS" as const, email: "rina@sundy.test" };

describe("menu samping", () => {
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

  it("menu Stok tidak ikut aktif di halaman Stok obat; lencana nol tidak tampil", () => {
    pathname.value = "/admin/stok-dokter";
    renderAdmin(<AppSidebar staff={{ ...staff, role: "DOKTER" }} pendingBookings={0} />);
    expect(screen.getByRole("link", { name: "Stok obat" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByLabelText("0 booking menunggu konfirmasi")).toBeNull();
  });
});

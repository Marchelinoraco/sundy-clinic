import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminShell } from "@/components/admin/mui/admin-shell";
import { DialogCloseButton } from "@/components/admin/mui/dialog-close-button";
import { NavUser } from "@/components/admin/nav-user";
import { renderAdmin } from "../helpers/render-admin";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/admin" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));

const staff = { userId: "u1", staffId: "s1", name: "Rina Resepsionis", role: "RESEPSIONIS" as const, email: "rina@sundy.test" };

describe("kerangka admin", () => {
  it("tombol Buka menu membuka laci menu; berpindah halaman menutupnya", async () => {
    const user = userEvent.setup();
    const { rerender } = renderAdmin(
      <AdminShell sidebar={<a href="/admin/booking">Booking</a>}>
        <AdminHeader title="Dasbor" />
      </AdminShell>,
    );
    expect(document.querySelector(".MuiDrawer-modal")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Buka menu" }));
    expect(document.querySelector(".MuiDrawer-modal")).not.toBeNull();

    pathname.value = "/admin/booking";
    rerender(
      <AdminShell sidebar={<a href="/admin/booking">Booking</a>}>
        <AdminHeader title="Booking" />
      </AdminShell>,
    );
    await vi.waitFor(() => expect(document.querySelector(".MuiDrawer-modal")).toBeNull());
  });

  it("menu pengguna di bilah atas (spec MUI 4): nama, peran, email, dan Keluar", async () => {
    const user = userEvent.setup();
    renderAdmin(
      <AdminShell sidebar={<span />} userMenu={<NavUser staff={staff} />}>
        <AdminHeader title="Dasbor" />
      </AdminShell>,
    );
    const banner = screen.getByRole("banner");
    await user.click(within(banner).getByRole("button", { name: "Menu pengguna Rina Resepsionis" }));
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("Rina Resepsionis");
    expect(menu).toHaveTextContent("Resepsionis · rina@sundy.test");
    expect(within(menu).getByRole("menuitem", { name: "Keluar" })).toBeInTheDocument();
  });

  it("tombol silang dialog bernama Close dan memanggil onClick", async () => {
    const onClick = vi.fn();
    renderAdmin(<DialogCloseButton onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("isi halaman ada di <main>; menu ada di navigasi Menu admin", () => {
    renderAdmin(
      <AdminShell sidebar={<a href="/admin">Dasbor</a>}>
        <p>Isi halaman</p>
      </AdminShell>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("Isi halaman");
    expect(screen.getByRole("navigation", { name: "Menu admin" })).toBeInTheDocument();
  });
});

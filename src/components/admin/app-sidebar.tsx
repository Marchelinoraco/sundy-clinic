import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  Contact,
  LayoutDashboard,
  Scissors,
  Settings,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { CLINIC_NAME } from "@/lib/clinic";
import { can, type Capability } from "@/lib/permissions";
import type { CurrentStaff } from "@/server/session";
import { NavUser } from "./nav-user";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard; needs?: Capability };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Utama",
    items: [
      { title: "Dasbor", url: "/admin", icon: LayoutDashboard },
      { title: "Booking", url: "/admin/booking", icon: CalendarClock, needs: "booking:manage" },
      { title: "Pasien", url: "/admin/pasien", icon: Contact, needs: "booking:manage" },
      { title: "Jadwal", url: "/admin/jadwal", icon: CalendarDays, needs: "schedule:manage" },
    ],
  },
  {
    title: "Kelola",
    items: [
      { title: "Layanan & Harga", url: "/admin/layanan", icon: Scissors, needs: "content:manage" },
      { title: "Staf", url: "/admin/staf", icon: Users, needs: "staff:manage" },
      { title: "Pengaturan", url: "/admin/pengaturan", icon: Settings, needs: "content:manage" },
    ],
  },
];

export function AppSidebar({
  staff,
  pendingBookings = 0,
}: {
  staff: CurrentStaff;
  /** Booking situs yang menunggu konfirmasi, ditampilkan sebagai angka di menu Booking. */
  pendingBookings?: number;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Pola yang sama dengan NavUser: saat sidebar diciutkan menjadi kolom ikon,
            hanya monogram yang tersisa — nama lengkap tidak muat di lebar 3rem. */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={CLINIC_NAME}>
              <Link href="/admin" aria-label={CLINIC_NAME}>
                <span
                  aria-hidden
                  className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-display text-base text-sidebar-primary-foreground"
                >
                  S
                </span>
                <span className="truncate font-display text-lg group-data-[collapsible=icon]:hidden">
                  {CLINIC_NAME}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          // Menu yang tidak berhak diakses tidak ditampilkan. Ini kenyamanan,
          // bukan keamanan — halamannya sendiri tetap memanggil
          // requireCapability(), karena URL bisa diketik langsung.
          const visible = group.items.filter((item) => !item.needs || can(staff.role, item.needs));
          if (visible.length === 0) return null;

          return (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <Link href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.url === "/admin/booking" && pendingBookings > 0 && (
                        <SidebarMenuBadge
                          aria-label={`${pendingBookings} booking menunggu konfirmasi`}
                          className="bg-amber-500 text-white peer-hover/menu-button:text-white"
                        >
                          {pendingBookings}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <NavUser staff={staff} />
      </SidebarFooter>
    </Sidebar>
  );
}

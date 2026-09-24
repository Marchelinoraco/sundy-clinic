import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  Contact,
  LayoutDashboard,
  Scissors,
  ShieldCheck,
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
      { title: "Jejak Audit", url: "/admin/audit", icon: ShieldCheck, needs: "audit:read" },
    ],
  },
];

export function AppSidebar({ staff }: { staff: CurrentStaff }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/admin" className="px-2 py-1 font-display text-lg">
          {CLINIC_NAME}
        </Link>
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

import Link from "next/link";
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  Contact,
  LayoutDashboard,
  Package,
  Scissors,
  Settings,
  Users,
  Banknote,
  ChartColumn,
  Pill,
  PillBottle,
  Receipt,
  Wallet,
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

export type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  needs?: Capability;
  /** Menu disembunyikan bagi peran yang memegang kemampuan ini (mis. Apoteker sudah punya menu Stok penuh). */
  hideWith?: Capability;
};

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Utama",
    items: [
      { title: "Dasbor", url: "/admin", icon: LayoutDashboard },
      { title: "Booking", url: "/admin/booking", icon: CalendarClock, needs: "booking:manage" },
      { title: "Pengingat", url: "/admin/pengingat", icon: BellRing, needs: "booking:manage" },
      { title: "Pasien", url: "/admin/pasien", icon: Contact, needs: "booking:manage" },
      { title: "Jadwal", url: "/admin/jadwal", icon: CalendarDays, needs: "schedule:manage" },
    ],
  },
{
    title: "Persediaan & keuangan",
    items: [
      { title: "Tagihan", url: "/admin/tagihan", icon: Receipt, needs: "invoice:read" },
      { title: "Resep", url: "/admin/resep", icon: Pill, needs: "dispense:read" },
      { title: "Stok", url: "/admin/stok", icon: Package, needs: "stock:read" },
      { title: "Stok obat", url: "/admin/stok-dokter", icon: PillBottle, needs: "stock:availability", hideWith: "stock:read" },
      { title: "Hutang", url: "/admin/hutang", icon: Wallet, needs: "payable:manage" },
      { title: "Pengeluaran", url: "/admin/pengeluaran", icon: Banknote, needs: "expense:manage" },
      { title: "Laporan", url: "/admin/laporan", icon: ChartColumn, needs: "profit:read" },
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

export function isNavItemVisible(role: CurrentStaff["role"], item: NavItem): boolean {
  if (item.needs && !can(role, item.needs)) return false;
  if (item.hideWith && can(role, item.hideWith)) return false;
  return true;
}

export function AppSidebar({
  staff,
  pendingBookings = 0,
  reminderWork = 0,
  stockAlerts = 0,
  overduePayables = 0,
  billable = 0,
  pendingDispensing = 0,
}: {
  staff: CurrentStaff;
  /** Booking yang menunggu konfirmasi (situs dan WA/telepon), angka di menu Booking. */
  pendingBookings?: number;
  /** Pesan WA yang masih harus dikirim (kotak 1 + 2 halaman Pengingat). */
  reminderWork?: number;
  /** Barang menipis atau kedaluwarsa di cabang aktif, angka di menu Stok. */
  stockAlerts?: number;
  /** Faktur hutang yang lewat jatuh tempo, angka di menu Hutang. */
  overduePayables?: number;
  /** Kunjungan final yang belum ditagih, angka di menu Tagihan. */
  billable?: number;
  /** Resep menunggu penyerahan, angka di menu Resep. */
  pendingDispensing?: number;
}) {
  const badges: Record<string, { count: number; label: string }> = {
    "/admin/booking": { count: pendingBookings, label: `${pendingBookings} booking menunggu konfirmasi` },
    "/admin/pengingat": { count: reminderWork, label: `${reminderWork} pesan WhatsApp belum dikirim` },
    "/admin/tagihan": { count: billable, label: `${billable} kunjungan perlu ditagih` },
    "/admin/resep": { count: pendingDispensing, label: `${pendingDispensing} resep menunggu` },
    "/admin/stok": { count: stockAlerts, label: `${stockAlerts} barang menipis atau kedaluwarsa` },
    "/admin/hutang": { count: overduePayables, label: `${overduePayables} faktur hutang terlambat` },
  };

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
          const visible = group.items.filter((item) => isNavItemVisible(staff.role, item));
          if (visible.length === 0) return null;

          return (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const badge = badges[item.url];
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild tooltip={item.title}>
                          <Link href={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                        {badge && badge.count > 0 && (
                          <SidebarMenuBadge
                            aria-label={badge.label}
                            className="bg-amber-500 text-white peer-hover/menu-button:text-white"
                          >
                            {badge.count}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
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

"use client";

import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ContactsOutlined from "@mui/icons-material/ContactsOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import EventNoteOutlined from "@mui/icons-material/EventNoteOutlined";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import InsertChartOutlined from "@mui/icons-material/InsertChartOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import LocalPharmacyOutlined from "@mui/icons-material/LocalPharmacyOutlined";
import MedicationOutlined from "@mui/icons-material/MedicationOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import SpaOutlined from "@mui/icons-material/SpaOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { CLINIC_NAME } from "@/lib/clinic";
import { can, type Capability } from "@/lib/permissions";
import type { CurrentStaff } from "@/server/session";

export type NavItem = {
  title: string;
  url: string;
  icon: SvgIconComponent;
  needs?: Capability;
  /** Menu disembunyikan bagi peran yang memegang kemampuan ini (mis. Apoteker sudah punya menu Stok penuh). */
  hideWith?: Capability;
};

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Utama",
    items: [
      { title: "Dasbor", url: "/admin", icon: DashboardOutlined },
      { title: "Booking", url: "/admin/booking", icon: EventNoteOutlined, needs: "booking:manage" },
      { title: "Pengingat", url: "/admin/pengingat", icon: NotificationsActiveOutlined, needs: "booking:manage" },
      { title: "Pasien", url: "/admin/pasien", icon: ContactsOutlined, needs: "booking:manage" },
      { title: "Jadwal", url: "/admin/jadwal", icon: CalendarMonthOutlined, needs: "schedule:manage" },
    ],
  },
{
    title: "Persediaan & keuangan",
    items: [
      { title: "Tagihan", url: "/admin/tagihan", icon: ReceiptLongOutlined, needs: "invoice:read" },
      { title: "Resep", url: "/admin/resep", icon: MedicationOutlined, needs: "dispense:read" },
      { title: "Stok", url: "/admin/stok", icon: Inventory2Outlined, needs: "stock:read" },
      { title: "Stok obat", url: "/admin/stok-dokter", icon: LocalPharmacyOutlined, needs: "stock:availability", hideWith: "stock:read" },
      { title: "Hutang", url: "/admin/hutang", icon: AccountBalanceWalletOutlined, needs: "payable:manage" },
      { title: "Pengeluaran", url: "/admin/pengeluaran", icon: PaymentsOutlined, needs: "expense:manage" },
      { title: "Laporan", url: "/admin/laporan", icon: InsertChartOutlined, needs: "profit:read" },
    ],
  },
  {
    title: "Kelola",
    items: [
      { title: "Layanan & Harga", url: "/admin/layanan", icon: SpaOutlined, needs: "content:manage" },
      { title: "Staf", url: "/admin/staf", icon: GroupOutlined, needs: "staff:manage" },
      { title: "Pengaturan", url: "/admin/pengaturan", icon: SettingsOutlined, needs: "content:manage" },
    ],
  },
];

export function isNavItemVisible(role: CurrentStaff["role"], item: NavItem): boolean {
  if (item.needs && !can(role, item.needs)) return false;
  if (item.hideWith && can(role, item.hideWith)) return false;
  return true;
}

/** Menu aktif: tepat alamatnya atau di bawahnya ("/admin/stok" tidak aktif di "/admin/stok-dokter"). */
function isActive(pathname: string, url: string): boolean {
  if (url === "/admin") return pathname === "/admin";
  return pathname === url || pathname.startsWith(`${url}/`);
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
  const pathname = usePathname() ?? "";
  const badges: Record<string, { count: number; label: string }> = {
    "/admin/booking": { count: pendingBookings, label: `${pendingBookings} booking menunggu konfirmasi` },
    "/admin/pengingat": { count: reminderWork, label: `${reminderWork} pesan WhatsApp belum dikirim` },
    "/admin/tagihan": { count: billable, label: `${billable} kunjungan perlu ditagih` },
    "/admin/resep": { count: pendingDispensing, label: `${pendingDispensing} resep menunggu` },
    "/admin/stok": { count: stockAlerts, label: `${stockAlerts} barang menipis atau kedaluwarsa` },
    "/admin/hutang": { count: overduePayables, label: `${overduePayables} faktur hutang terlambat` },
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ px: 2, py: 1.5 }}>
        <MuiLink component={NextLink} href="/admin" aria-label={CLINIC_NAME} underline="none" sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "text.primary" }}>
          <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "grid", placeItems: "center", fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 700 }}>
            S
          </Box>
          <Typography component="span" sx={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "1.25rem", fontWeight: 600, whiteSpace: "nowrap" }}>
            {CLINIC_NAME}
          </Typography>
        </MuiLink>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {NAV_GROUPS.map((group) => {
          // Menu yang tidak berhak diakses tidak ditampilkan. Ini kenyamanan, bukan keamanan.
          const visible = group.items.filter((item) => isNavItemVisible(staff.role, item));
          if (visible.length === 0) return null;
          return (
            <List key={group.title} dense subheader={<ListSubheader component="div" sx={{ bgcolor: "transparent", lineHeight: "32px" }}>{group.title}</ListSubheader>}>
              {visible.map((item) => {
                const badge = badges[item.url];
                const active = isActive(pathname, item.url);
                return (
                  <ListItem
                    key={item.url}
                    disablePadding
                    secondaryAction={badge && badge.count > 0 ? <Chip size="small" color="warning" label={badge.count} aria-label={badge.label} /> : undefined}
                  >
                    <ListItemButton component={NextLink} href={item.url} selected={active} aria-current={active ? "page" : undefined} sx={{ mx: 1, borderRadius: 2 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <item.icon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={item.title} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          );
        })}
      </Box>
    </Box>
  );
}

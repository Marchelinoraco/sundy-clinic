import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { can } from "@/lib/permissions";
import { countPendingBookings } from "@/server/appointment";
import { countOverduePayables } from "@/server/payable-read";
import { countReminderWork } from "@/server/reminder";
import { requireStaff } from "@/server/session";
import { countStockAlerts } from "@/server/stock-read";

export const metadata = { title: "Panel Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Dijalankan untuk setiap halaman di bawah /admin. Satu tempat yang
  // memastikan tidak ada halaman admin yang lupa menuntut login.
  const staff = await requireStaff();
  const [pendingBookings, reminderWork] = can(staff.role, "booking:manage")
    ? await Promise.all([countPendingBookings(), countReminderWork()])
    : [0, 0];
  const [stockAlerts, overduePayables] = await Promise.all([
    can(staff.role, "stock:read") ? countStockAlerts().then((alerts) => alerts.low + alerts.expired) : 0,
    can(staff.role, "payable:manage") ? countOverduePayables() : 0,
  ]);

  return (
    // TooltipProvider dibutuhkan SidebarMenuButton (label saat sidebar
    // diciutkan jadi ikon). Dipasang di sini, bukan di root layout, karena
    // hanya panel admin yang memakai sidebar bertooltip.
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar staff={staff} pendingBookings={pendingBookings} reminderWork={reminderWork} stockAlerts={stockAlerts} overduePayables={overduePayables} />
        <SidebarInset>{children}</SidebarInset>
        {/* Kanan atas: bar aksi halaman kunjungan menempel di bawah, dan toast di sana menutupi Finalisasi. */}
        <Toaster position="top-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}

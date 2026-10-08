import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AdminToaster } from "@/components/admin/mui/admin-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { LiveNotifier } from "@/components/admin/live-notifier";
import { can } from "@/lib/permissions";
import { countPendingBookings } from "@/server/appointment";
import { countPendingDispensings } from "@/server/dispensing-read";
import { countBillable } from "@/server/invoice-read";
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
  const [stockAlerts, overduePayables, billable, pendingDispensing] = await Promise.all([
    can(staff.role, "stock:read") ? countStockAlerts().then((alerts) => alerts.low + alerts.expired) : 0,
    can(staff.role, "payable:manage") ? countOverduePayables() : 0,
    can(staff.role, "invoice:manage") ? countBillable() : 0,
    can(staff.role, "dispense:read") ? countPendingDispensings() : 0,
  ]);

  return (
    // TooltipProvider dibutuhkan SidebarMenuButton (label saat sidebar
    // diciutkan jadi ikon). Dipasang di sini, bukan di root layout, karena
    // hanya panel admin yang memakai sidebar bertooltip.
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar staff={staff} pendingBookings={pendingBookings} reminderWork={reminderWork} stockAlerts={stockAlerts} overduePayables={overduePayables} billable={billable} pendingDispensing={pendingDispensing} />
        <SidebarInset>{children}</SidebarInset>
        {/* Kanan atas: bar aksi halaman kunjungan menempel di bawah, dan toast di sana menutupi Finalisasi. */}
        <AdminToaster />
        <LiveNotifier initialSince={new Date().toISOString()} role={staff.role} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

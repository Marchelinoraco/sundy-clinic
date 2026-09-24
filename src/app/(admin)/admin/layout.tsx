import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { requireStaff } from "@/server/session";

export const metadata = { title: "Panel Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Dijalankan untuk setiap halaman di bawah /admin. Satu tempat yang
  // memastikan tidak ada halaman admin yang lupa menuntut login.
  const staff = await requireStaff();

  return (
    // TooltipProvider dibutuhkan SidebarMenuButton (label saat sidebar
    // diciutkan jadi ikon). Dipasang di sini, bukan di root layout, karena
    // hanya panel admin yang memakai sidebar bertooltip.
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar staff={staff} />
        <SidebarInset>{children}</SidebarInset>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}

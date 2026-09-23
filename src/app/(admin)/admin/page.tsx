import { AdminHeader } from "@/components/admin/admin-header";
import { requireStaff } from "@/server/session";

export default async function AdminDashboardPage() {
  const staff = await requireStaff();

  return (
    <>
      <AdminHeader title="Dasbor" />
      <div className="p-6">
        <h2 className="font-display text-3xl">Selamat datang, {staff.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Booking dan rekam medis dibangun pada tahap berikutnya. Untuk saat ini Anda dapat
          mengelola layanan, harga, dan staf lewat menu di samping.
        </p>
      </div>
    </>
  );
}

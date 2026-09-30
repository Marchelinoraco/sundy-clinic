import { AdminHeader } from "@/components/admin/admin-header";
import { DoctorWorklistView } from "@/components/admin/doctor-worklist";
import { can } from "@/lib/permissions";
import { listDoctorWorklist } from "@/server/encounter-read";
import { requireStaff } from "@/server/session";

export default async function AdminDashboardPage() {
  const staff = await requireStaff();
  // Dasbor dokter hanya untuk pembaca rekam medis (spec 4.2); resepsionis tetap seperti biasa.
  const worklist = can(staff.role, "record:read") ? await listDoctorWorklist() : null;

  return (
    <>
      <AdminHeader title="Dasbor" />
      <div className="space-y-8 p-6">
        <div>
          <h2 className="font-display text-3xl">Selamat datang, {staff.name}</h2>
          {!worklist && (
            <p className="mt-2 text-sm text-muted-foreground">
              Kelola booking dan kedatangan pasien lewat menu Booking, dan data pasien lewat menu Pasien.
            </p>
          )}
        </div>
        {worklist && <DoctorWorklistView worklist={worklist} />}
      </div>
    </>
  );
}

import { AdminHeader } from "@/components/admin/admin-header";
import { StaffTable } from "@/components/admin/staff-table";
import { listStaff } from "@/server/staff";
import { requireCapability } from "@/server/session";

export default async function StaffPage() {
  await requireCapability("staff:manage");
  const staff = await listStaff();

  return (
    <>
      <AdminHeader title="Staf" />
      <div className="p-6">
        <StaffTable staff={staff} />
      </div>
    </>
  );
}

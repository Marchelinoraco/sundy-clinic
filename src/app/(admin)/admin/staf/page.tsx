import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { StaffManager } from "@/components/admin/staff/staff-manager";
import { listStaffAccounts } from "@/server/staff";
import { requireCapability } from "@/server/session";

export default async function StaffPage() {
  const staff = await requireCapability("staff:manage");
  const rows = await listStaffAccounts();

  return (
    <>
      <AdminHeader title="Staf" />
      <PageBody>
        <PageHeader title="Staf" description="Akun staf dan perannya di panel. Staf berperan Terapis tidak punya akun login." />
        <StaffManager rows={rows} currentStaffId={staff.staffId} />
      </PageBody>
    </>
  );
}

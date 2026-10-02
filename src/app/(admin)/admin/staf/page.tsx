import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { StaffTable } from "@/components/admin/staff-table";
import { listStaff } from "@/server/staff";
import { requireCapability } from "@/server/session";

export default async function StaffPage() {
  await requireCapability("staff:manage");
  const staff = await listStaff();

  return (
    <>
      <AdminHeader title="Staf" />
      <PageBody>
        <PageHeader title="Staf" description="Akun staf dan perannya di panel." />
        <SectionCard title="Daftar staf" flush>
          <StaffTable staff={staff} />
        </SectionCard>
      </PageBody>
    </>
  );
}

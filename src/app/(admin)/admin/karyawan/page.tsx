import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { EmployeeDialog } from "@/components/admin/payroll/employee-dialog";
import { EmployeeTable } from "@/components/admin/payroll/employee-table";
import { getBranches } from "@/server/catalog";
import { listEmployees, listLinkableStaff } from "@/server/payroll-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Karyawan" };

type Tab = "karyawan" | "penggajian";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCapability("payroll:manage");
  const tab: Tab = (await searchParams).tab === "penggajian" ? "penggajian" : "karyawan";
  const branches = (await getBranches()).map((b) => ({ id: b.id, name: b.name }));
  const staffOptions = await listLinkableStaff();

  return (
    <>
      <AdminHeader title="Karyawan" />
      <PageBody>
        <PageHeader
          title="Karyawan"
          description="Data karyawan, gaji bulanan, dan pembayaran komisi. Pembayaran otomatis tercatat di Pengeluaran."
          actions={tab === "karyawan" ? <EmployeeDialog branches={branches} staffOptions={staffOptions} /> : undefined}
        />
        <PageTabs
          label="Bagian karyawan"
          active={tab}
          tabs={[
            { id: "karyawan", label: "Karyawan", href: "/admin/karyawan" },
            { id: "penggajian", label: "Penggajian", href: "/admin/karyawan?tab=penggajian" },
          ]}
        />
        {tab === "karyawan" ? (
          <EmployeeTable rows={await listEmployees()} branches={branches} staffOptions={staffOptions} />
        ) : (
          <EmptyState>Belum ada penggajian.</EmptyState>
        )}
      </PageBody>
    </>
  );
}

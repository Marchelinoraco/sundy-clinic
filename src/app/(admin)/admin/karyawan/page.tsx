import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { AdminHeader } from "@/components/admin/admin-header";
import { TextLink } from "@/components/admin/mui/links";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { EmployeeDialog } from "@/components/admin/payroll/employee-dialog";
import { EmployeeTable } from "@/components/admin/payroll/employee-table";
import { PayrollMonthPicker } from "@/components/admin/payroll/payroll-month-picker";
import { currentMonthOf } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { listEmployees, listLinkableStaff, listPayrollPeriods } from "@/server/payroll-read";
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
          <PayrollTab />
        )}
      </PageBody>
    </>
  );
}

async function PayrollTab() {
  const periods = await listPayrollPeriods();
  const thisMonth = currentMonthOf(witaDateString(new Date()));
  return (
    <>
      <PayrollMonthPicker initialMonth={thisMonth} />
      <SectionCard title="Penggajian" flush>
        {periods.length === 0 ? (
          <EmptyState>Belum ada penggajian.</EmptyState>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Bulan</TableCell>
                  <TableCell align="right">Karyawan</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Dibayar</TableCell>
                  <TableCell align="right">Belum dibayar</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.month}>
                    <TableCell>
                      <TextLink href={`/admin/karyawan/penggajian/${p.month}`}>{p.month}</TextLink>
                    </TableCell>
                    <TableCell align="right">{p.employees}</TableCell>
                    <TableCell align="right">{formatRupiah(p.total)}</TableCell>
                    <TableCell align="right">{formatRupiah(p.paid)}</TableCell>
                    <TableCell align="right">{formatRupiah(p.unpaid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>
    </>
  );
}

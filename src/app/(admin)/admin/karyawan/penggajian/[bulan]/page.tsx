import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { AddEmployeeToPayroll, CreatePayrollButton, DeletePayrollButton } from "@/components/admin/payroll/payroll-period-actions";
import { PayrollTable } from "@/components/admin/payroll/payroll-table";
import { isMonthString } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { witaDateString } from "@/lib/time";
import { getPayrollPeriod } from "@/server/payroll-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Penggajian" };

export default async function PayrollMonthPage({ params }: { params: Promise<{ bulan: string }> }) {
  await requireCapability("payroll:manage");
  const { bulan } = await params;
  if (!isMonthString(bulan)) notFound();
  const detail = await getPayrollPeriod(bulan);
  const today = witaDateString(new Date());
  const trail = [{ label: "Karyawan", href: "/admin/karyawan" }, { label: "Penggajian", href: "/admin/karyawan?tab=penggajian" }, { label: bulan }];

  if (!detail) {
    return (
      <>
        <AdminHeader title="Karyawan" />
        <PageBody>
          <PageHeader title={`Penggajian ${bulan}`} trail={trail} description="Belum ada penggajian untuk bulan ini." />
          <EmptyState>
            <CreatePayrollButton month={bulan} />
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const total = detail.items.reduce((sum, i) => sum + i.total, 0);
  const paid = detail.items.filter((i) => i.paidAt).reduce((sum, i) => sum + i.total, 0);
  const commission = detail.items.reduce((sum, i) => sum + i.commission, 0);
  return (
    <>
      <AdminHeader title="Karyawan" />
      <PageBody>
        <PageHeader title={`Penggajian ${bulan}`} trail={trail} description="Komisi baris yang belum dibayar dihitung ulang setiap halaman dibuka." actions={<DeletePayrollButton month={bulan} />} />
        <SectionCard title="Ringkasan">
          <Box component="dl" sx={{ m: 0, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, "& dt": { color: "text.secondary", fontSize: "0.875rem" }, "& dd": { m: 0, fontWeight: 600 } }}>
            <div>
              <dt>Total</dt>
              <dd>{formatRupiah(total)}</dd>
            </div>
            <div>
              <dt>Komisi</dt>
              <dd>{formatRupiah(commission)}</dd>
            </div>
            <div>
              <dt>Sudah dibayar</dt>
              <dd>{formatRupiah(paid)}</dd>
            </div>
            <div>
              <dt>Belum dibayar</dt>
              <dd>{formatRupiah(total - paid)}</dd>
            </div>
          </Box>
        </SectionCard>
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <AddEmployeeToPayroll month={bulan} options={detail.addable} />
        </Stack>
        <PayrollTable month={bulan} items={detail.items} today={today} />
      </PageBody>
    </>
  );
}

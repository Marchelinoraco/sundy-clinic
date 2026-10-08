import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { CategoryManager } from "@/components/admin/expenses/category-manager";
import { ExpenseFormDialog } from "@/components/admin/expenses/expense-form-dialog";
import { ExpenseTable } from "@/components/admin/expenses/expense-table";
import { RecurringDialog } from "@/components/admin/expenses/recurring-dialog";
import { RecurringTable } from "@/components/admin/expenses/recurring-table";
import { MonthField } from "@/components/admin/mui/date-field";
import { TextLink } from "@/components/admin/mui/links";
import { SelectField } from "@/components/admin/mui/select-field";
import { PageTabs } from "@/components/admin/page-tabs";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { addMonths, currentMonthOf, isMonthString } from "@/lib/expense";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { listCategories, listExpenses, listRecurring } from "@/server/expense-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Pengeluaran" };

type Search = { tab?: string; bulan?: string; kategori?: string; cabang?: string };
type Tab = "catatan" | "berulang" | "kategori";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireCapability("expense:manage");
  const params = await searchParams;
  const tab: Tab = params.tab === "berulang" || params.tab === "kategori" ? params.tab : "catatan";
  const today = witaDateString(new Date());
  const thisMonth = currentMonthOf(today);
  const month = isMonthString(params.bulan) ? params.bulan : thisMonth;
  const branches = (await getBranches()).filter((b) => b.status === "AKTIF").map((b) => ({ id: b.id, name: b.name }));
  const allCategories = await listCategories({ includeInactive: true });
  const activeCategories = allCategories.filter((c) => c.isActive);

  const actions =
    tab === "catatan" ? (
      <ExpenseFormDialog categories={activeCategories} branches={branches} today={today} />
    ) : tab === "berulang" ? (
      <RecurringDialog categories={activeCategories} branches={branches} currentMonth={thisMonth} />
    ) : undefined;

  return (
    <>
      <AdminHeader title="Pengeluaran" />
      <PageBody>
        <PageHeader title="Pengeluaran" description="Biaya klinik di luar harga pokok obat: gaji, sewa, listrik, dan sejenisnya." actions={actions} />
        <PageTabs
          label="Bagian pengeluaran"
          active={tab}
          tabs={[
            { id: "catatan", label: "Catatan", href: "/admin/pengeluaran" },
            { id: "berulang", label: "Berulang", href: "/admin/pengeluaran?tab=berulang" },
            { id: "kategori", label: "Kategori", href: "/admin/pengeluaran?tab=kategori" },
          ]}
        />
        {tab === "catatan" && (
          <>
            <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
              {/* key: isian dipasang ulang mengikuti alamat setelah pindah bulan (nilai MonthField disimpan di state). */}
              <Form key={`${month}|${params.kategori ?? ""}|${params.cabang ?? ""}`} action="/admin/pengeluaran">
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                  <MonthField name="bulan" label="Bulan" defaultValue={month} sx={{ width: 176 }} />
                  <SelectField name="kategori" defaultValue={params.kategori ?? ""} aria-label="Kategori" fullWidth={false} sx={{ minWidth: 170 }}>
                    <option value="">Semua kategori</option>
                    {allCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField name="cabang" defaultValue={params.cabang ?? ""} aria-label="Cabang" fullWidth={false} sx={{ minWidth: 160 }}>
                    <option value="">Semua cabang</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </SelectField>
                  <Button type="submit" variant="outlined">
                    Terapkan
                  </Button>
                </Stack>
              </Form>
              <Stack component="nav" aria-label="Pindah bulan" direction="row" spacing={1.5} sx={{ fontSize: "0.875rem" }}>
                <TextLink href={`/admin/pengeluaran?bulan=${addMonths(month, -1)}`} underline="always">
                  ← Bulan sebelumnya
                </TextLink>
                <TextLink href={`/admin/pengeluaran?bulan=${addMonths(month, 1)}`} underline="always">
                  Bulan berikutnya →
                </TextLink>
              </Stack>
            </Stack>
            <SectionCard title={`Pengeluaran ${month}`} flush>
              <ExpenseTable rows={await listExpenses({ month, categoryId: params.kategori || undefined, branchId: params.cabang || undefined })} />
            </SectionCard>
          </>
        )}
        {tab === "berulang" && (
          <SectionCard title="Pengeluaran berulang" flush>
            <RecurringTable rows={await listRecurring()} categories={activeCategories} branches={branches} currentMonth={thisMonth} />
          </SectionCard>
        )}
        {tab === "kategori" && (
          <SectionCard title="Kategori pengeluaran" flush>
            <CategoryManager categories={allCategories} />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}

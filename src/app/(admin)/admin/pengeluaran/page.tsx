import Form from "next/form";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { CategoryManager } from "@/components/admin/expenses/category-manager";
import { ExpenseFormDialog } from "@/components/admin/expenses/expense-form-dialog";
import { ExpenseTable } from "@/components/admin/expenses/expense-table";
import { RecurringDialog } from "@/components/admin/expenses/recurring-dialog";
import { RecurringTable } from "@/components/admin/expenses/recurring-table";
import { PageTabs } from "@/components/admin/page-tabs";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMonths, currentMonthOf, isMonthString } from "@/lib/expense";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { listCategories, listExpenses, listRecurring } from "@/server/expense-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Pengeluaran" };

type Search = { tab?: string; bulan?: string; kategori?: string; cabang?: string };
type Tab = "catatan" | "berulang" | "kategori";

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

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
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Form action="/admin/pengeluaran" className="flex flex-wrap items-end gap-2">
                <Input name="bulan" type="month" defaultValue={month} aria-label="Bulan" className="w-44" />
                <select name="kategori" defaultValue={params.kategori ?? ""} aria-label="Kategori" className={selectClass}>
                  <option value="">Semua kategori</option>
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select name="cabang" defaultValue={params.cabang ?? ""} aria-label="Cabang" className={selectClass}>
                  <option value="">Semua cabang</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline">
                  Terapkan
                </Button>
              </Form>
              <nav aria-label="Pindah bulan" className="flex gap-3 text-sm">
                <Link className="underline underline-offset-4" href={`/admin/pengeluaran?bulan=${addMonths(month, -1)}`}>
                  ← Bulan sebelumnya
                </Link>
                <Link className="underline underline-offset-4" href={`/admin/pengeluaran?bulan=${addMonths(month, 1)}`}>
                  Bulan berikutnya →
                </Link>
              </nav>
            </div>
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

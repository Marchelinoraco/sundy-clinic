import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { StockAvailabilityTable } from "@/components/admin/dispensing/stock-availability-table";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBranches } from "@/server/catalog";
import { requireCapability } from "@/server/session";
import { listStockAvailability } from "@/server/stock-availability";

export const metadata = { title: "Stok obat" };

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export default async function StockAvailabilityPage({ searchParams }: { searchParams: Promise<{ cabang?: string; cari?: string }> }) {
  await requireCapability("stock:availability");
  const params = await searchParams;
  const branches = (await getBranches()).filter((branch) => branch.status === "AKTIF");
  const branch = branches.find((b) => b.id === params.cabang) ?? branches[0];
  const q = params.cari?.trim() || undefined;

  return (
    <>
      <AdminHeader title="Stok obat" />
      <PageBody>
        <PageHeader title="Stok obat" description="Ketersediaan obat dan produk di cabang, untuk menulis catatan kunjungan." />
        {!branch ? (
          <EmptyState>Belum ada cabang aktif.</EmptyState>
        ) : (
          <>
            <Form action="/admin/stok-dokter" className="flex flex-wrap items-end gap-2">
              <select name="cabang" defaultValue={branch.id} aria-label="Cabang" className={selectClass}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <Input name="cari" defaultValue={q ?? ""} placeholder="Cari nama atau kode" aria-label="Cari barang" className="max-w-xs" />
              <Button type="submit" variant="outline">
                Cari
              </Button>
            </Form>
            <SectionCard title={branch.name} flush>
              <StockAvailabilityTable rows={await listStockAvailability({ branchId: branch.id, q })} />
            </SectionCard>
          </>
        )}
      </PageBody>
    </>
  );
}

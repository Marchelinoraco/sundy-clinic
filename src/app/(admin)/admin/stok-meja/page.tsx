import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { CounterStockTable } from "@/components/admin/counter/counter-stock-table";
import { RestockRequestDialog } from "@/components/admin/counter/restock-request-dialog";
import { RestockRequestList } from "@/components/admin/counter/restock-request-list";
import { LinkButton } from "@/components/admin/mui/links";
import { SelectField } from "@/components/admin/mui/select-field";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { can } from "@/lib/permissions";
import { getBranches } from "@/server/catalog";
import { listCounterItems } from "@/server/counter-read";
import { listRestockRequests } from "@/server/restock-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Stok meja" };

/** Stok di meja resepsionis dan permintaan restock (spec stok meja 4.1). */
export default async function CounterStockPage({ searchParams }: { searchParams: Promise<{ cabang?: string; tampil?: string }> }) {
  const staff = await requireCapability("counter:read");
  const params = await searchParams;
  const branches = (await getBranches()).filter((branch) => branch.status === "AKTIF");
  if (branches.length === 0) {
    return (
      <>
        <AdminHeader title="Stok meja" />
        <PageBody>
          <EmptyState>Belum ada cabang aktif.</EmptyState>
        </PageBody>
      </>
    );
  }
  const branch = branches.find((b) => b.id === params.cabang) ?? branches[0];
  const canRequest = can(staff.role, "restock:request");
  const canFill = can(staff.role, "stock:manage");
  const [items, pending, history] = await Promise.all([
    listCounterItems(branch.id),
    listRestockRequests({ branchId: branch.id, view: "MENUNGGU" }),
    listRestockRequests({ branchId: branch.id, view: "RIWAYAT" }),
  ]);
  const needs = items.filter((item) => item.flag !== null || item.expired > 0);
  const showAll = params.tampil === "semua" || needs.length === 0;
  const query = (tampil?: string) => `/admin/stok-meja?${new URLSearchParams({ cabang: branch.id, ...(tampil ? { tampil } : {}) }).toString()}`;

  return (
    <>
      <AdminHeader title="Stok meja" />
      <PageBody>
        <PageHeader
          title="Stok meja"
          description={`${branch.name} · obat dan produk di meja resepsionis`}
          actions={canRequest ? <RestockRequestDialog branchId={branch.id} options={items} /> : undefined}
        />
        {branches.length > 1 && (
          <Form action="/admin/stok-meja" aria-label="Pilih cabang">
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <SelectField name="cabang" defaultValue={branch.id} aria-label="Cabang" fullWidth={false} sx={{ minWidth: 160 }}>
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
        )}
        <SectionCard
          title="Barang di meja"
          description={showAll ? "Semua barang aktif." : "Barang yang menipis, habis, atau kedaluwarsa di meja."}
          actions={
            needs.length > 0 ? (
              <LinkButton href={showAll ? query() : query("semua")} variant="outlined" size="small">
                {showAll ? "Perlu restock" : "Semua barang"}
              </LinkButton>
            ) : undefined
          }
          flush
        >
          <CounterStockTable rows={showAll ? items : needs} branchId={branch.id} branchName={branch.name} canFill={canFill} />
        </SectionCard>
        <SectionCard title="Permintaan menunggu" flush>
          <RestockRequestList rows={pending} canCancel={canRequest} linkToDetail={canFill} />
        </SectionCard>
        <SectionCard title="Riwayat permintaan" description="50 terakhir." flush>
          <RestockRequestList rows={history} canCancel={false} linkToDetail={false} />
        </SectionCard>
      </PageBody>
    </>
  );
}

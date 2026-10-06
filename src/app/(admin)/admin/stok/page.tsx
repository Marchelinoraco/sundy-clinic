import Form from "next/form";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PurchaseTable } from "@/components/admin/stock/purchase-table";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { StockItemTable } from "@/components/admin/stock/stock-item-table";
import { SupplierDialog } from "@/components/admin/stock/supplier-dialog";
import { SupplierTable } from "@/components/admin/stock/supplier-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  isStockFlag,
  STOCK_FLAG_LABEL,
  STOCK_ITEM_KIND_LABEL,
  summarizeStock,
  type StockFlag,
  type StockItemKindValue,
} from "@/lib/stock";
import { getBranches } from "@/server/catalog";
import { listPurchases } from "@/server/purchase-read";
import { requireCapability } from "@/server/session";
import { listStockItems, listSuppliers } from "@/server/stock-read";

export const metadata = { title: "Stok" };

type Search = { tab?: string; cabang?: string; jenis?: string; tanda?: string; cari?: string };
type Tab = "barang" | "masuk" | "supplier";

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const FLAGS = Object.keys(STOCK_FLAG_LABEL) as StockFlag[];
const KINDS = Object.keys(STOCK_ITEM_KIND_LABEL) as StockItemKindValue[];

export default async function StockPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await requireCapability("stock:read");
  const params = await searchParams;
  const canManage = can(staff.role, "stock:manage");
  const tab: Tab = params.tab === "masuk" || params.tab === "supplier" ? params.tab : "barang";

  const actions = !canManage ? undefined : tab === "barang" ? (
    <StockItemDialog triggerLabel="+ Barang" />
  ) : tab === "masuk" ? (
    <Button asChild>
      <Link href="/admin/stok/masuk/baru">+ Barang masuk</Link>
    </Button>
  ) : (
    <SupplierDialog triggerLabel="+ Supplier" />
  );

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader title="Stok" description="Obat dan produk per cabang, barang masuk dari supplier, dan supplier." actions={actions} />
        <PageTabs
          label="Bagian stok"
          active={tab}
          tabs={[
            { id: "barang", label: "Barang", href: "/admin/stok" },
            { id: "masuk", label: "Barang masuk", href: "/admin/stok?tab=masuk" },
            { id: "supplier", label: "Supplier", href: "/admin/stok?tab=supplier" },
          ]}
        />
        {tab === "barang" && <ItemsTab params={params} />}
        {tab === "masuk" && (
          <SectionCard title="Barang masuk" description="Faktur supplier terbaru di atas." flush>
            <PurchaseTable rows={await listPurchases()} />
          </SectionCard>
        )}
        {tab === "supplier" && (
          <SectionCard title="Supplier" flush>
            <SupplierTable rows={await listSuppliers()} canManage={canManage} />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}

async function ItemsTab({ params }: { params: Search }) {
  const branches = (await getBranches()).filter((branch) => branch.status === "AKTIF");
  if (branches.length === 0) return <EmptyState>Belum ada cabang aktif.</EmptyState>;
  const branch = branches.find((b) => b.id === params.cabang) ?? branches[0];
  const kind = KINDS.find((k) => k === params.jenis);
  const flag: StockFlag | "NONAKTIF" | undefined =
    params.tanda === "NONAKTIF" ? "NONAKTIF" : isStockFlag(params.tanda) ? params.tanda : undefined;
  const q = params.cari?.trim() || undefined;
  const filtered = Boolean(kind || flag || q);

  const rows = await listStockItems({ branchId: branch.id, kind, flag, q });
  // Ringkasan selalu untuk seluruh barang aktif cabang, bukan hanya hasil saringan.
  const summary = summarizeStock(filtered ? await listStockItems({ branchId: branch.id }) : rows);

  return (
    <>
      <SectionCard title={`Ringkasan ${branch.name}`}>
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Nilai stok (harga beli)</dt>
            <dd className="text-lg font-semibold">{formatRupiah(summary.value)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Menipis</dt>
            <dd className="text-lg font-semibold">{summary.low} barang</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Segera kedaluwarsa</dt>
            <dd className="text-lg font-semibold">{summary.expiringSoon} barang</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kedaluwarsa</dt>
            <dd className="text-lg font-semibold">{summary.expired} barang</dd>
          </div>
        </dl>
      </SectionCard>

      <Form action="/admin/stok" className="flex flex-wrap items-end gap-2" aria-label="Saring barang">
        {branches.length > 1 && (
          <select name="cabang" defaultValue={branch.id} aria-label="Cabang" className={selectClass}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select name="jenis" defaultValue={kind ?? ""} aria-label="Jenis" className={selectClass}>
          <option value="">Semua jenis</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {STOCK_ITEM_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select name="tanda" defaultValue={flag ?? ""} aria-label="Tanda" className={selectClass}>
          <option value="">Semua barang aktif</option>
          {FLAGS.map((f) => (
            <option key={f} value={f}>
              {STOCK_FLAG_LABEL[f]}
            </option>
          ))}
          <option value="NONAKTIF">Nonaktif</option>
        </select>
        <Input name="cari" defaultValue={q ?? ""} placeholder="Cari nama atau kode" aria-label="Cari nama atau kode" className="w-56" />
        <Button type="submit" variant="outline">
          Terapkan
        </Button>
      </Form>

      <SectionCard title="Barang" flush>
        <StockItemTable rows={rows} />
      </SectionCard>
    </>
  );
}

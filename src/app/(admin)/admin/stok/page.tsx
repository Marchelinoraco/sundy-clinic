import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { LinkButton } from "@/components/admin/mui/links";
import { SelectField } from "@/components/admin/mui/select-field";
import { PageTabs } from "@/components/admin/page-tabs";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PurchaseTable } from "@/components/admin/stock/purchase-table";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { StockItemTable } from "@/components/admin/stock/stock-item-table";
import { SupplierDialog } from "@/components/admin/stock/supplier-dialog";
import { SupplierTable } from "@/components/admin/stock/supplier-table";
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
    <LinkButton href="/admin/stok/masuk/baru" variant="contained">
      + Barang masuk
    </LinkButton>
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
        <Box
          component="dl"
          sx={{
            m: 0,
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(4, 1fr)" },
            fontSize: "0.875rem",
            "& dt": { color: "text.secondary" },
            "& dd": { m: 0, fontSize: "1.125rem", fontWeight: 600 },
          }}
        >
          <div>
            <dt>Nilai stok (harga beli)</dt>
            <dd>{formatRupiah(summary.value)}</dd>
          </div>
          <div>
            <dt>Menipis</dt>
            <dd>{summary.low} barang</dd>
          </div>
          <div>
            <dt>Segera kedaluwarsa</dt>
            <dd>{summary.expiringSoon} barang</dd>
          </div>
          <div>
            <dt>Kedaluwarsa</dt>
            <dd>{summary.expired} barang</dd>
          </div>
        </Box>
      </SectionCard>

      <Form action="/admin/stok" aria-label="Saring barang">
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          {branches.length > 1 && (
            <SelectField name="cabang" defaultValue={branch.id} aria-label="Cabang" fullWidth={false} sx={{ minWidth: 160 }}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField name="jenis" defaultValue={kind ?? ""} aria-label="Jenis" fullWidth={false} sx={{ minWidth: 150 }}>
            <option value="">Semua jenis</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {STOCK_ITEM_KIND_LABEL[k]}
              </option>
            ))}
          </SelectField>
          <SelectField name="tanda" defaultValue={flag ?? ""} aria-label="Tanda" fullWidth={false} sx={{ minWidth: 190 }}>
            <option value="">Semua barang aktif</option>
            {FLAGS.map((f) => (
              <option key={f} value={f}>
                {STOCK_FLAG_LABEL[f]}
              </option>
            ))}
            <option value="NONAKTIF">Nonaktif</option>
          </SelectField>
          <TextField
            name="cari"
            defaultValue={q ?? ""}
            placeholder="Cari nama atau kode"
            autoComplete="off"
            slotProps={{ htmlInput: { "aria-label": "Cari nama atau kode" } }}
            sx={{ width: "100%", maxWidth: 224 }}
          />
          <Button type="submit" variant="outlined">
            Terapkan
          </Button>
        </Stack>
      </Form>

      <SectionCard title="Barang" flush>
        <StockItemTable rows={rows} />
      </SectionCard>
    </>
  );
}

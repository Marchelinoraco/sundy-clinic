import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { StatTile } from "@/components/admin/stat-tile";
import { PayableTable } from "@/components/admin/stock/payable-table";
import { formatRupiah } from "@/lib/format";
import { isPayableView, PAYABLE_VIEW_LABEL, PAYABLE_VIEWS, type PayableView } from "@/lib/stock";
import { listPayables, payablesOverview } from "@/server/payable-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Hutang" };

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ lihat?: string; supplier?: string }> }) {
  await requireCapability("payable:manage");
  const params = await searchParams;
  const view: PayableView = isPayableView(params.lihat) ? params.lihat : "BELUM_LUNAS";
  const supplierId = params.supplier || undefined;
  const [overview, rows] = await Promise.all([payablesOverview(), listPayables({ view, supplierId })]);

  const href = (next: { lihat?: PayableView; supplier?: string | null }) => {
    const query = new URLSearchParams();
    const nextView = next.lihat ?? view;
    if (nextView !== "BELUM_LUNAS") query.set("lihat", nextView);
    const nextSupplier = next.supplier === undefined ? supplierId : next.supplier;
    if (nextSupplier) query.set("supplier", nextSupplier);
    const text = query.toString();
    return text ? `/admin/hutang?${text}` : "/admin/hutang";
  };
  const supplierName = supplierId
    ? (overview.bySupplier.find((row) => row.supplierId === supplierId)?.supplierName ?? rows[0]?.supplierName ?? "supplier ini")
    : null;

  return (
    <>
      <AdminHeader title="Hutang" />
      <PageBody>
        <PageHeader title="Hutang" description="Hutang ke supplier dari faktur barang masuk." />

        <section aria-label="Ringkasan hutang" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Sisa hutang" value={formatRupiah(overview.totalBalance)} href={href({ lihat: "BELUM_LUNAS", supplier: null })} />
          <StatTile
            label="Terlambat"
            value={formatRupiah(overview.overdueBalance)}
            note={`${overview.overdueCount} faktur`}
            href={href({ lihat: "TERLAMBAT", supplier: null })}
            attention={overview.overdueCount > 0}
          />
          <StatTile
            label="Jatuh tempo 7 hari"
            value={overview.dueSoonCount}
            note="faktur"
            href={href({ lihat: "JATUH_TEMPO", supplier: null })}
            attention={overview.dueSoonCount > 0}
          />
          <StatTile label="Kredit dari supplier" value={formatRupiah(overview.credit)} href={href({ lihat: "BELUM_LUNAS", supplier: null })} />
        </section>

        <PageTabs
          label="Tampilan hutang"
          active={view}
          tabs={PAYABLE_VIEWS.map((value) => ({ id: value, label: PAYABLE_VIEW_LABEL[value], href: href({ lihat: value }) }))}
        />
        {supplierName && (
          <p className="text-sm">
            Supplier: <strong>{supplierName}</strong> ·{" "}
            <Link href={href({ supplier: null })} className="underline underline-offset-4">
              Semua supplier
            </Link>
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <SectionCard title="Daftar hutang" flush>
            <PayableTable rows={rows} />
          </SectionCard>
          <SectionCard title="Sisa per supplier" flush>
            {overview.bySupplier.length === 0 ? (
              <EmptyState>Tidak ada hutang.</EmptyState>
            ) : (
              <ul className="divide-y text-sm">
                {overview.bySupplier.map((row) => (
                  <li key={row.supplierId} className="flex items-center justify-between gap-2 px-4 py-2">
                    <Link href={href({ supplier: row.supplierId })} className="underline-offset-4 hover:underline">
                      {row.supplierName}
                    </Link>
                    <span className="text-right">
                      {formatRupiah(row.balance)}
                      {row.overdueCount > 0 && <span className="block text-xs text-destructive">{row.overdueCount} terlambat</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </PageBody>
    </>
  );
}

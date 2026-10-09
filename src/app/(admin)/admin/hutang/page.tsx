import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { AdminHeader } from "@/components/admin/admin-header";
import { TextLink } from "@/components/admin/mui/links";
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

        <Box
          component="section"
          aria-label="Ringkasan hutang"
          sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" } }}
        >
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
        </Box>

        <PageTabs
          label="Tampilan hutang"
          active={view}
          tabs={PAYABLE_VIEWS.map((value) => ({ id: value, label: PAYABLE_VIEW_LABEL[value], href: href({ lihat: value }) }))}
        />
        {supplierName && (
          <Typography variant="body2">
            Supplier: <strong>{supplierName}</strong> ·{" "}
            <TextLink href={href({ supplier: null })} underline="always">
              Semua supplier
            </TextLink>
          </Typography>
        )}

        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 20rem" } }}>
          <SectionCard title="Daftar hutang" flush>
            <PayableTable rows={rows} />
          </SectionCard>
          <SectionCard title="Sisa per supplier" flush>
            {overview.bySupplier.length === 0 ? (
              <EmptyState>Tidak ada hutang.</EmptyState>
            ) : (
              <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, fontSize: "0.875rem", "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
                {overview.bySupplier.map((row) => (
                  <Box component="li" key={row.supplierId} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 2, py: 1 }}>
                    <TextLink href={href({ supplier: row.supplierId })}>{row.supplierName}</TextLink>
                    <Box component="span" sx={{ textAlign: "right" }}>
                      {formatRupiah(row.balance)}
                      {row.overdueCount > 0 && (
                        <Box component="span" sx={{ display: "block", fontSize: "0.75rem", color: "error.main" }}>
                          {row.overdueCount} terlambat
                        </Box>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        </Box>
      </PageBody>
    </>
  );
}

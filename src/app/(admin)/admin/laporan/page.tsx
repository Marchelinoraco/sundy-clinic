import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import { AdminHeader } from "@/components/admin/admin-header";
import { LinkButton } from "@/components/admin/mui/links";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { CashFlowCard } from "@/components/admin/report/cash-flow-card";
import { ReportDetail } from "@/components/admin/report/report-detail";
import { ReportFilter } from "@/components/admin/report/report-filter";
import { PackageSessionsTable } from "@/components/admin/report/package-sessions-table";
import { CommissionReportView } from "@/components/admin/report/commission-report";
import { MarginReportView } from "@/components/admin/report/margin-report";
import { ReportSummary } from "@/components/admin/report/report-summary";
import { PageTabs } from "@/components/admin/page-tabs";
import { TrendChart } from "@/components/admin/report/trend-chart";
import { isReportPreset, periodLabel, presetPeriod, validatePeriod, type ReportPeriod, type ReportPreset } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { getCommissionReport, getMarginReport, getProfitReport } from "@/server/report-read";
import { resolveTab } from "@/lib/page-tabs";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Laporan" };

type Search = { periode?: string; dari?: string; sampai?: string; cabang?: string; tab?: string; pelaksana?: string };

export default async function ReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireCapability("profit:read");
  const params = await searchParams;
  const today = witaDateString(new Date());
  const preset: ReportPreset = isReportPreset(params.periode) ? params.periode : "BULAN_INI";

  let period: ReportPeriod = presetPeriod("BULAN_INI", today);
  let notice: string | null = null;
  if (preset === "RENTANG") {
    const checked = validatePeriod({ from: params.dari, to: params.sampai });
    if (checked.ok) period = checked.value;
    else notice = `${checked.message} Menampilkan bulan ini.`;
  } else {
    period = presetPeriod(preset, today);
  }

  const branches = (await getBranches()).filter((b) => b.status === "AKTIF").map((b) => ({ id: b.id, name: b.name }));
  const branchId = branches.some((b) => b.id === params.cabang) ? (params.cabang ?? null) : null;
  const report = await getProfitReport({ period, branchId });
  const query = new URLSearchParams({ dari: period.from, sampai: period.to, ...(branchId ? { cabang: branchId } : {}) });
  const tab = resolveTab(params.tab, ["ringkasan", "margin", "komisi"] as const);
  const base = new URLSearchParams({ periode: preset, dari: period.from, sampai: period.to, ...(branchId ? { cabang: branchId } : {}) }).toString();

  return (
    <>
      <AdminHeader title="Laporan" />
      <PageBody>
        <PageHeader
          title="Laporan untung-rugi"
          description={`${periodLabel(period)} · ${report.branchName} · dibandingkan dengan ${periodLabel(report.previousPeriod)}`}
          actions={
            tab === "ringkasan" ? (
              <LinkButton href={`/admin/laporan/unduh?${query.toString()}`} download variant="outlined">
                Unduh CSV
              </LinkButton>
            ) : undefined
          }
        />
        {/* key: isian tanggal menyimpan nilainya sendiri dan Next tidak memasang ulang halaman saat hanya alamat yang berubah,
            jadi tanpa ini kolom Dari/Sampai tertinggal di periode lama setelah memilih "Bulan lalu". */}
        <ReportFilter key={`${preset}|${period.from}|${period.to}|${branchId ?? ""}`} preset={preset} period={period} branchId={branchId} branches={branches} tab={tab === "ringkasan" ? undefined : tab} />
        <PageTabs
          label="Bagian laporan"
          active={tab}
          tabs={[
            { id: "ringkasan", label: "Ringkasan", href: `/admin/laporan?${base}` },
            { id: "margin", label: "Margin", href: `/admin/laporan?${base}&tab=margin` },
            { id: "komisi", label: "Komisi", href: `/admin/laporan?${base}&tab=komisi` },
          ]}
        />
        {notice && (
          <Alert severity="error">{notice}</Alert>
        )}
        {tab === "ringkasan" && (
          <>
          <ReportSummary view={report.current} comparison={report.comparison} />
          {report.current.missingCost > 0 && (
            <Alert severity="warning">
              {report.current.missingCost} baris barang belum punya harga pokok; laba bisa lebih tinggi dari sebenarnya. Isi harga beli di Stok → Barang masuk.
            </Alert>
          )}
          <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 22rem" } }}>
            <SectionCard title="Rincian" flush>
              <ReportDetail current={report.current} previous={report.previous} />
            </SectionCard>
            <SectionCard title="Arus kas" flush>
              <CashFlowCard cash={report.current.cash} />
            </SectionCard>
          </Box>
          <SectionCard
            title="Sesi paket terpakai"
            description="Sesi dan barang dari paket customer yang dipakai di tagihan final periode ini; pendapatannya sudah dihitung saat paket dijual."
            flush
          >
            <PackageSessionsTable rows={report.packageSessions} />
          </SectionCard>
          <SectionCard title="Tren 12 bulan">
            <TrendChart points={report.trend} />
          </SectionCard>
          </>
        )}
        {tab === "margin" && (
          <SectionCard title="Margin" description="Pendapatan bersih dikurangi harga pokok barang, bahan, alat, dan komisi treatment. Hanya tagihan final." flush>
            <MarginReportView report={await getMarginReport({ period, branchId })} />
          </SectionCard>
        )}
        {tab === "komisi" && (
          <SectionCard title="Komisi pelaksana" flush>
            <CommissionReportView
              {...(await getCommissionReport({ period, branchId, performerId: typeof params.pelaksana === "string" ? params.pelaksana : null }))}
              selected={typeof params.pelaksana === "string" ? params.pelaksana : null}
              hrefFor={(id) => `/admin/laporan?${base}&tab=komisi&pelaksana=${encodeURIComponent(id)}`}
              downloadHref={`/admin/laporan/unduh?${query.toString()}&jenis=komisi`}
            />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}

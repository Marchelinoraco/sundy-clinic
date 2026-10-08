import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import { AdminHeader } from "@/components/admin/admin-header";
import { LinkButton } from "@/components/admin/mui/links";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { CashFlowCard } from "@/components/admin/report/cash-flow-card";
import { ReportDetail } from "@/components/admin/report/report-detail";
import { ReportFilter } from "@/components/admin/report/report-filter";
import { ReportSummary } from "@/components/admin/report/report-summary";
import { TrendChart } from "@/components/admin/report/trend-chart";
import { isReportPreset, periodLabel, presetPeriod, validatePeriod, type ReportPeriod, type ReportPreset } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { getProfitReport } from "@/server/report-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Laporan" };

type Search = { periode?: string; dari?: string; sampai?: string; cabang?: string };

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

  return (
    <>
      <AdminHeader title="Laporan" />
      <PageBody>
        <PageHeader
          title="Laporan untung-rugi"
          description={`${periodLabel(period)} · ${report.branchName} · dibandingkan dengan ${periodLabel(report.previousPeriod)}`}
          actions={
            <LinkButton href={`/admin/laporan/unduh?${query.toString()}`} download variant="outlined">
              Unduh CSV
            </LinkButton>
          }
        />
        <ReportFilter preset={preset} period={period} branchId={branchId} branches={branches} />
        {notice && (
          <Alert severity="error">{notice}</Alert>
        )}
        <ReportSummary view={report.current} comparison={report.comparison} />
        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 22rem" } }}>
          <SectionCard title="Rincian" flush>
            <ReportDetail current={report.current} previous={report.previous} />
          </SectionCard>
          <SectionCard title="Arus kas" flush>
            <CashFlowCard cash={report.current.cash} />
          </SectionCard>
        </Box>
        <SectionCard title="Tren 12 bulan">
          <TrendChart points={report.trend} />
        </SectionCard>
      </PageBody>
    </>
  );
}

import { prisma } from "@/lib/db";
import { reportCsvRows, summarizeReport, toCsv, validatePeriod, type ReportPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { ensureRecurringExpenses } from "@/server/expense-store";
import { collectReport } from "@/server/report-read";
import { requireCapability } from "@/server/session";

/** CSV laporan untuk satu periode dan cabang (spec laporan 8). Unduhan dicatat di jejak audit. */
export async function exportReportCsv(filter: { period: ReportPeriod; branchId: string | null }): Promise<{ filename: string; csv: string }> {
  const actor = await requireCapability("profit:read");
  const checked = validatePeriod(filter.period);
  if (!checked.ok) throw new Error(checked.message);
  let branchName = "Semua cabang";
  if (filter.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: filter.branchId }, select: { name: true } });
    if (!branch) throw new Error("Cabang tidak ditemukan.");
    branchName = branch.name;
  }
  await ensureRecurringExpenses(witaDateString(new Date()));
  const view = summarizeReport(await collectReport(checked.value, filter.branchId));
  const { from, to } = checked.value;
  await recordAudit({
    actor,
    action: "report.export",
    entity: "Report",
    entityId: `${from}_${to}`,
    summary: `${from} sampai ${to} · ${branchName}`,
  });
  return { filename: `laporan-untung-rugi-${from}-${to}.csv`, csv: toCsv(reportCsvRows({ period: checked.value, branchName }, view)) };
}

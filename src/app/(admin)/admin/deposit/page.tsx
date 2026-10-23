import { AdminHeader } from "@/components/admin/admin-header";
import { DepositBalanceTable, DepositHistoryTable } from "@/components/admin/deposit/deposit-tables";
import { LinkButton } from "@/components/admin/mui/links";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { resolveTab } from "@/lib/page-tabs";
import { can } from "@/lib/permissions";
import { dateLabel } from "@/lib/stock";
import { listDepositBalances, listDepositHistory } from "@/server/deposit-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Deposit" };

/** Daftar deposit semua pasien (spec deposit D18): saldo yang masih berlaku dan riwayat gerakannya. */
export default async function DepositPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; sebelum?: string | string[] }> }) {
  const staff = await requireCapability("invoice:read");
  const params = await searchParams;
  const tabs = [
    { id: "aktif", label: "Aktif", href: "/admin/deposit" },
    { id: "riwayat", label: "Riwayat", href: "/admin/deposit?tab=riwayat" },
  ];
  const active = resolveTab(params.tab, tabs.map((tab) => tab.id));
  const before = typeof params.sebelum === "string" ? params.sebelum : undefined;

  return (
    <>
      <AdminHeader title="Deposit" />
      <PageBody>
        <PageHeader
          title="Deposit pasien"
          description="Saldo dari kelebihan bayar dan sisa deposit booking, berlaku 30 hari dan dipotong otomatis di tagihan berikutnya."
        />
        <PageTabs label="Bagian deposit" active={active} tabs={tabs} />
        {active === "aktif" && (
          <SectionCard title="Saldo yang masih berlaku" flush>
            <DepositBalanceTable
              rows={await listDepositBalances()}
              canRefund={can(staff.role, "invoice:manage") || can(staff.role, "invoice:correct")}
              patientLinks={can(staff.role, "booking:manage")}
            />
          </SectionCard>
        )}
        {active === "riwayat" && <History before={before} />}
      </PageBody>
    </>
  );
}

async function History({ before }: { before?: string }) {
  const history = await listDepositHistory({ before });
  return (
    <SectionCard
      title="Riwayat deposit"
      description={`${dateLabel(history.from)} – ${dateLabel(history.to)}`}
      actions={
        <LinkButton href={`/admin/deposit?tab=riwayat&sebelum=${history.olderBefore}`} variant="outlined" size="small">
          Lebih lama
        </LinkButton>
      }
      flush
    >
      <DepositHistoryTable rows={history.rows} />
    </SectionCard>
  );
}

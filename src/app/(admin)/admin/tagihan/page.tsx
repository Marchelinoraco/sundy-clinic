import { AdminHeader } from "@/components/admin/admin-header";
import { BillableTable } from "@/components/admin/billing/billable-table";
import { DirectSaleDialog } from "@/components/admin/billing/direct-sale-dialog";
import { InvoiceTable } from "@/components/admin/billing/invoice-table";
import { PageTabs } from "@/components/admin/page-tabs";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { INVOICE_VIEW_LABEL, INVOICE_VIEWS, isInvoiceView, type InvoiceView } from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { listBillableVisits, listInvoices } from "@/server/invoice-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Tagihan" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ lihat?: string; q?: string }> }) {
  const staff = await requireCapability("invoice:read");
  const params = await searchParams;
  const view: InvoiceView = isInvoiceView(params.lihat) ? params.lihat : "PERLU_DITAGIH";
  const q = params.q?.trim() || undefined;
  const canManage = can(staff.role, "invoice:manage");
  const rows = view === "PERLU_DITAGIH" ? null : await listInvoices({ view, q });
  const billable = view === "PERLU_DITAGIH" ? await listBillableVisits() : null;

  return (
    <>
      <AdminHeader title="Tagihan" />
      <PageBody>
        <PageHeader
          title="Tagihan"
          description="Tagihan customer dari kunjungan dan penjualan langsung."
          actions={canManage ? <DirectSaleDialog /> : undefined}
        />
        <PageTabs
          label="Tampilan tagihan"
          active={view}
          tabs={INVOICE_VIEWS.map((value) => ({
            id: value,
            label: INVOICE_VIEW_LABEL[value],
            href: value === "PERLU_DITAGIH" ? "/admin/tagihan" : `/admin/tagihan?lihat=${value}`,
          }))}
        />
        {view === "PERLU_DITAGIH" ? (
          <SectionCard title="Perlu ditagih" flush>
            <BillableTable rows={billable ?? []} canManage={canManage} />
          </SectionCard>
        ) : (
          <SectionCard title={INVOICE_VIEW_LABEL[view]} flush>
            <InvoiceTable rows={rows ?? []} />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}

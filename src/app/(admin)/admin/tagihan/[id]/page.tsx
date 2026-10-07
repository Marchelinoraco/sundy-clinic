import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { InvoiceDraftEditor } from "@/components/admin/billing/invoice-draft-editor";
import { InvoiceStatusBadge } from "@/components/admin/billing/invoice-status-badge";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { can } from "@/lib/permissions";
import { getInvoiceDetail, listBillingItems } from "@/server/invoice-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Tagihan" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("invoice:read");
  const detail = await getInvoiceDetail((await params).id);
  if (!detail) notFound();
  const canManage = can(staff.role, "invoice:manage");

  return (
    <>
      <AdminHeader title="Tagihan" />
      <PageBody>
        <PageHeader
          title={detail.number ? `Tagihan ${detail.number}` : "Tagihan (draf)"}
          trail={[{ label: "Tagihan", href: "/admin/tagihan" }, { label: detail.number ?? "Draf" }]}
          description={`${detail.patient.name} · ${detail.patient.medicalRecordNumber} · ${detail.branchName}`}
          actions={<InvoiceStatusBadge status={detail.totals.display} />}
        />
        {detail.status === "DRAF" ? (
          canManage ? (
            <InvoiceDraftEditor detail={detail} items={await listBillingItems(detail.branchId)} canExceedDiscount={can(staff.role, "invoice:correct")} />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">Tagihan ini masih draf; hanya resepsionis yang bisa mengubahnya.</p>
          )
        ) : null}
      </PageBody>
    </>
  );
}

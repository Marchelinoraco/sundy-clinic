import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { InvoiceFinalView } from "@/components/admin/billing/invoice-final-view";
import { InvoiceDraftEditor } from "@/components/admin/billing/invoice-draft-editor";
import { InvoiceStatusBadge } from "@/components/admin/billing/invoice-status-badge";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { can } from "@/lib/permissions";
import { getInvoiceDetail, listBillingItems } from "@/server/invoice-read";
import { getInvoiceReceipt } from "@/server/receipt";
import { requireCapability } from "@/server/session";
import { witaDateString } from "@/lib/time";

export const metadata = { title: "Tagihan" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("invoice:read");
  const detail = await getInvoiceDetail((await params).id);
  if (!detail) notFound();
  const canManage = can(staff.role, "invoice:manage");
  const receipt = detail.status === "DRAF" ? null : await getInvoiceReceipt(detail.id);

  return (
    <>
      <AdminHeader title="Tagihan" />
      <PageBody>
        <div className={receipt ? "struk-tanpa-cetak" : undefined}>
          <PageHeader
            title={detail.number ? `Tagihan ${detail.number}` : "Tagihan (draf)"}
            trail={[{ label: "Tagihan", href: "/admin/tagihan" }, { label: detail.number ?? "Draf" }]}
            description={`${detail.patient.name} · ${detail.patient.medicalRecordNumber} · ${detail.branchName}`}
            actions={<InvoiceStatusBadge status={detail.totals.display} />}
          />
        </div>
        {detail.status === "DRAF" ? (
          canManage ? (
            <InvoiceDraftEditor detail={detail} items={await listBillingItems(detail.branchId)} canExceedDiscount={can(staff.role, "invoice:correct")} />
          ) : (
            <Typography role="status" variant="body2" sx={{ color: "text.secondary" }}>
              Tagihan ini masih draf; hanya resepsionis yang bisa mengubahnya.
            </Typography>
          )
        ) : (
          <InvoiceFinalView
            detail={detail}
            today={witaDateString(new Date())}
            canManage={canManage}
            canCorrect={can(staff.role, "invoice:correct")}
            canSeeCost={can(staff.role, "stock:read")}
            receipt={receipt}
          />
        )}
      </PageBody>
    </>
  );
}

import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { InvoiceFinalView } from "@/components/admin/billing/invoice-final-view";
import { InvoiceDraftEditor } from "@/components/admin/billing/invoice-draft-editor";
import { InvoiceDraftReadOnly } from "@/components/admin/billing/invoice-draft-read-only";
import { InvoiceStatusBadge } from "@/components/admin/billing/invoice-status-badge";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { can } from "@/lib/permissions";
import { getInvoiceDetail, listBillingItems, listPerformers } from "@/server/invoice-read";
import { listActiveClinicBankAccounts } from "@/server/clinic-bank";
import { getInvoiceReceipt } from "@/server/receipt";
import { requireCapability } from "@/server/session";
import { listCounterItems } from "@/server/counter-read";
import { listInternalServiceOptions } from "@/server/internal-catalog";
import { listSellablePackages } from "@/server/treatment-package-catalog";
import { listPackageOptions } from "@/server/patient-package-read";
import { witaDateString } from "@/lib/time";

export const metadata = { title: "Tagihan" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("invoice:read");
  const detail = await getInvoiceDetail((await params).id);
  if (!detail) notFound();
  const canManage = can(staff.role, "invoice:manage");
  const canEditNotes = canManage || can(staff.role, "invoice:correct");
  const receipt = detail.status === "DRAF" ? null : await getInvoiceReceipt(detail.id);
  const bankAccounts = detail.status === "FINAL" && canManage ? await listActiveClinicBankAccounts() : [];

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
            <InvoiceDraftEditor
              detail={detail}
              items={await listBillingItems(detail.branchId)}
              canExceedDiscount={can(staff.role, "invoice:correct")}
              canEditNotes={canEditNotes}
              packages={await listSellablePackages()}
              packageOptions={await listPackageOptions(detail.patient.id, detail.id)}
              performers={await listPerformers()}
              services={await listInternalServiceOptions()}
              restock={can(staff.role, "restock:request") ? { branchId: detail.branchId, options: await listCounterItems(detail.branchId) } : null}
            />
          ) : (
            <InvoiceDraftReadOnly invoiceId={detail.id} notes={detail.notes} canEditNotes={canEditNotes} />
          )
        ) : (
          <InvoiceFinalView
            detail={detail}
            today={witaDateString(new Date())}
            canManage={canManage}
            canCorrect={can(staff.role, "invoice:correct")}
            canSeeCost={can(staff.role, "price:manage")}
            receipt={receipt}
            canEditNotes={canEditNotes}
            bankAccounts={bankAccounts}
          />
        )}
      </PageBody>
    </>
  );
}

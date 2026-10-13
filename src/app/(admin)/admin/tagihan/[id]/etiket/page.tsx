import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PrescriptionLabel } from "@/components/admin/billing/prescription-label";
import { PrintButton } from "@/components/admin/billing/print-button";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { CLINIC_NAME } from "@/lib/clinic";
import { getInvoicePrescriptionLabel } from "@/server/invoice-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Etiket obat" };

export default async function InvoiceLabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("invoice:read");
  const { id } = await params;
  const data = await getInvoicePrescriptionLabel(id);
  if (!data) notFound();

  return (
    <>
      <div className="print:hidden">
        <AdminHeader title="Tagihan" />
      </div>
      <PageBody>
        <div className="print:hidden">
          <PageHeader title="Etiket obat" trail={[{ label: "Tagihan", href: "/admin/tagihan" }, { label: data.patientName, href: `/admin/tagihan/${id}` }, { label: "Etiket" }]} actions={<PrintButton />} />
        </div>
        <PrescriptionLabel data={data} clinicName={CLINIC_NAME} />
      </PageBody>
    </>
  );
}

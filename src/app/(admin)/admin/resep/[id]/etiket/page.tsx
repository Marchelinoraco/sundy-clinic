import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PrintButton } from "@/components/admin/billing/print-button";
import { DispensingLabel } from "@/components/admin/dispensing/dispensing-label";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { CLINIC_NAME } from "@/lib/clinic";
import { getDispensingDetail } from "@/server/dispensing-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Etiket obat" };

export default async function DispensingLabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("dispense:read");
  const detail = await getDispensingDetail((await params).id);
  if (!detail || detail.status !== "SELESAI") notFound();

  return (
    <>
      <div className="print:hidden">
        <AdminHeader title="Resep" />
      </div>
      <PageBody>
        <div className="print:hidden">
          <PageHeader
            title="Etiket obat"
            trail={[{ label: "Resep", href: "/admin/resep" }, { label: detail.patientName, href: `/admin/resep/${detail.id}` }, { label: "Etiket" }]}
            actions={<PrintButton />}
          />
        </div>
        <DispensingLabel detail={detail} clinicName={CLINIC_NAME} />
      </PageBody>
    </>
  );
}

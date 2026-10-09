import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { DispensingEditor } from "@/components/admin/dispensing/dispensing-editor";
import { DispensingSummary } from "@/components/admin/dispensing/dispensing-summary";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { formatDateWithYear } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getDispensingDetail, listDispenseItems } from "@/server/dispensing-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Resep" };

export default async function DispensingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("dispense:read");
  const detail = await getDispensingDetail((await params).id);
  if (!detail) notFound();
  const canManage = can(staff.role, "dispense:manage");

  return (
    <>
      <AdminHeader title="Resep" />
      <PageBody>
        <PageHeader
          title={detail.patientName}
          trail={[{ label: "Resep", href: "/admin/resep" }, { label: detail.patientName }]}
          description={`${detail.branchName} · kunjungan ${formatDateWithYear(detail.startAt)}`}
        />
        {detail.status === "MENUNGGU" ? (
          canManage ? (
            <DispensingEditor detail={detail} items={await listDispenseItems(detail.branchId)} />
          ) : (
            <Typography role="status" variant="body2" sx={{ color: "text.secondary" }}>
              Penyerahan ini masih menunggu Apoteker.
            </Typography>
          )
        ) : (
          <DispensingSummary detail={detail} />
        )}
      </PageBody>
    </>
  );
}

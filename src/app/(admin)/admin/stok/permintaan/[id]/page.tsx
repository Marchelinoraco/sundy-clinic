import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { RestockRequestList } from "@/components/admin/counter/restock-request-list";
import { RestockSendForm } from "@/components/admin/counter/restock-send-form";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { RESTOCK_STATUS_LABEL } from "@/lib/counter-stock";
import { formatDateWithYear } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { getRestockRequest } from "@/server/restock-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Permintaan restock" };

export default async function RestockRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("stock:manage");
  const request = await getRestockRequest((await params).id);
  if (!request) notFound();

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title={`Permintaan restock dari ${request.requestedByName}`}
          trail={[{ label: "Stok", href: "/admin/stok" }, { label: "Permintaan", href: "/admin/stok?tab=permintaan" }, { label: request.requestedByName }]}
          description={`${request.branchName} · ${formatDateWithYear(request.createdAt)} ${minutesToTimeLabel(witaMinutesOfDay(request.createdAt))} · ${RESTOCK_STATUS_LABEL[request.status]}`}
        />
        {request.note && <Typography variant="body2">Catatan: {request.note}</Typography>}
        {request.status === "MENUNGGU" ? (
          <RestockSendForm request={request} />
        ) : (
          <SectionCard title="Hasil" flush>
            <RestockRequestList rows={[request]} canCancel={false} linkToDetail={false} />
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}

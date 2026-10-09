import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EncounterPageView } from "@/components/admin/encounter-page-view";
import { PageBody } from "@/components/admin/page-layout";
import { can } from "@/lib/permissions";
import { getBiaForVisit } from "@/server/bia-read";
import { getEncounterForStaff } from "@/server/encounter-read";
import { requireCapability } from "@/server/session";

/** Halaman untuk pembaca rekam medis saja; resepsionis ditolak di sini (spec bagian 8). */
export default async function EncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("record:read");
  const { id } = await params;
  const encounter = await getEncounterForStaff(id);
  if (!encounter) notFound();
  const bia = await getBiaForVisit(encounter.appointment.id);

  return (
    <>
      <AdminHeader title="Kunjungan" heading />
      <PageBody wide>
        <EncounterPageView encounter={encounter} bia={bia} canWrite={can(staff.role, "record:write")} />
      </PageBody>
    </>
  );
}

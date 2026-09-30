import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EncounterPageView } from "@/components/admin/encounter-page-view";
import { can } from "@/lib/permissions";
import { getEncounterForStaff } from "@/server/encounter-read";
import { requireCapability } from "@/server/session";

/** Halaman untuk pembaca rekam medis saja; resepsionis ditolak di sini (spec bagian 8). */
export default async function EncounterPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("record:read");
  const { id } = await params;
  const encounter = await getEncounterForStaff(id);
  if (!encounter) notFound();

  return (
    <>
      <AdminHeader title="Kunjungan" />
      <div className="p-6">
        <EncounterPageView encounter={encounter} canWrite={can(staff.role, "record:write")} />
      </div>
    </>
  );
}

import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { IntakeView } from "@/components/admin/intake-view";
import { getIntakeForStaff } from "@/server/intake";
import { requireCapability } from "@/server/session";

/** Halaman ini untuk pembaca rekam medis saja; resepsionis ditolak di sini (spec 6.2). */
export default async function IntakePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability("record:read");
  const { id } = await params;
  const intake = await getIntakeForStaff(id);
  if (!intake) notFound();

  return (
    <>
      <AdminHeader title="Isian Pendaftaran" />
      <div className="p-6">
        <IntakeView intake={intake} />
      </div>
    </>
  );
}

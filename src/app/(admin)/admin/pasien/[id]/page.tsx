import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PatientDetailView } from "@/components/admin/patient-detail-view";
import { can } from "@/lib/permissions";
import { getPatientDetail } from "@/server/patient";
import { requireCapability } from "@/server/session";

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("booking:manage");
  const { id } = await params;
  const patient = await getPatientDetail(id);
  if (!patient) notFound();

  return (
    <>
      <AdminHeader title="Data Pasien" />
      <div className="p-6">
        <PatientDetailView
          patient={patient}
          canReadRecords={can(staff.role, "record:read")}
          canWriteRecords={can(staff.role, "record:write")}
        />
      </div>
    </>
  );
}

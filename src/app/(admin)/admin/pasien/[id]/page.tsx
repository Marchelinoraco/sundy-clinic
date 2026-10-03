import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { PATIENT_PROGRAM_LABEL, PatientDetailView } from "@/components/admin/patient-detail-view";
import { Button } from "@/components/ui/button";
import { formatDateWithYear } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getPatientDetail } from "@/server/patient";
import { requireCapability } from "@/server/session";

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const staff = await requireCapability("booking:manage");
  const { id } = await params;
  const { tab } = await searchParams;
  const patient = await getPatientDetail(id);
  if (!patient) notFound();

  const description = [
    patient.medicalRecordNumber,
    PATIENT_PROGRAM_LABEL[patient.programStatus],
    patient.lastVisitAt ? `kunjungan terakhir ${formatDateWithYear(patient.lastVisitAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <AdminHeader title="Data Pasien" />
      <PageBody>
        <PageHeader
          title={patient.name}
          trail={[{ label: "Pasien", href: "/admin/pasien" }, { label: patient.name }]}
          description={description}
          actions={
            !patient.mergedInto && (
              <Button asChild>
                <Link href={`/admin/booking/baru?pasien=${patient.id}`}>+ Booking</Link>
              </Button>
            )
          }
        />
        <PatientDetailView
          patient={patient}
          canReadRecords={can(staff.role, "record:read")}
          canWriteRecords={can(staff.role, "record:write")}
          tab={typeof tab === "string" ? tab : undefined}
        />
      </PageBody>
    </>
  );
}

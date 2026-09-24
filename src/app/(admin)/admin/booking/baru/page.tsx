import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentForm, type BookingServiceGroup } from "@/components/admin/appointment-form";
import { witaDateString } from "@/lib/time";
import { getBranches, getServiceCategoriesWithServices } from "@/server/catalog";
import { listSchedulableStaff } from "@/server/schedule";
import { requireCapability } from "@/server/session";

const CONSULTATION_SERVICE_SLUG = "konsultasi-dokter";

export default async function NewAppointmentPage() {
  await requireCapability("booking:manage");

  const [branches, categories, staffList] = await Promise.all([
    getBranches(),
    getServiceCategoriesWithServices(),
    listSchedulableStaff(),
  ]);

  const activeBranches = branches.filter((b) => b.status === "AKTIF");
  const consultation = categories
    .flatMap((c) => c.services)
    .find((s) => s.slug === CONSULTATION_SERVICE_SLUG);

  const treatmentGroups: BookingServiceGroup[] = categories
    .map((c) => ({
      name: c.name,
      services: c.services
        .filter((s) => s.slug !== CONSULTATION_SERVICE_SLUG)
        .map((s) => ({
          id: s.id,
          name: s.name,
          durationMin: s.durationMin,
          requiresDoctor: s.requiresDoctor,
        })),
    }))
    .filter((g) => g.services.length > 0);

  return (
    <>
      <AdminHeader title="Booking Baru" />
      <div className="p-6">
        {activeBranches.length === 0 || staffList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada cabang aktif atau tenaga yang dapat dijadwalkan.
          </p>
        ) : (
          <AppointmentForm
            branches={activeBranches.map((b) => ({ id: b.id, name: b.name }))}
            staff={staffList.map((s) => ({
              id: s.id,
              name: s.name,
              role: s.role === "DOKTER" ? "DOKTER" : "TERAPIS",
            }))}
            treatmentGroups={treatmentGroups}
            consultationServiceId={consultation?.id ?? null}
            today={witaDateString(new Date())}
          />
        )}
      </div>
    </>
  );
}

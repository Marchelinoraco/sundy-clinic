import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentForm, type BookingServiceGroup } from "@/components/admin/appointment-form";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { witaDateString } from "@/lib/time";
import { resolveBookingPrefill } from "@/server/booking-prefill";
import { getBranches, getServiceCategoriesWithServices } from "@/server/catalog";
import { getClinicSetting } from "@/server/clinic-setting";
import { listSchedulableStaff } from "@/server/schedule";
import { requireCapability } from "@/server/session";

const CONSULTATION_SERVICE_SLUG = "konsultasi-dokter";

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireCapability("booking:manage");
  const params = await searchParams;

  const [branches, categories, staffList, setting, prefill] = await Promise.all([
    getBranches(),
    getServiceCategoriesWithServices(),
    listSchedulableStaff(),
    getClinicSetting(),
    resolveBookingPrefill({ pasien: one(params.pasien), tenaga: one(params.tenaga), tanggal: one(params.tanggal), jam: one(params.jam) }),
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
      <PageBody>
        <PageHeader
          title="Booking Baru"
          trail={[{ label: "Booking", href: "/admin/booking" }, { label: "Baru" }]}
          description="Untuk booking lewat WhatsApp, telepon, atau pasien yang datang langsung."
        />
        {activeBranches.length === 0 || staffList.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada cabang aktif atau tenaga yang dapat dijadwalkan.</p>
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
            bookingFee={setting.bookingFee}
            initial={prefill.initial}
            notice={prefill.notice}
          />
        )}
      </PageBody>
    </>
  );
}

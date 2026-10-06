import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentForm, type BookingServiceGroup } from "@/components/admin/appointment-form";
import { OnlineAppointmentForm } from "@/components/admin/online-appointment-form";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { witaDateString } from "@/lib/time";
import { resolveBookingPrefill } from "@/server/booking-prefill";
import { getBranches, getServiceCategoriesWithServices } from "@/server/catalog";
import { getClinicSetting } from "@/server/clinic-setting";
import { loadOnlineService } from "@/server/online-store";
import { listSchedulableStaff } from "@/server/schedule";
import { requireCapability } from "@/server/session";

const CONSULTATION_SERVICE_SLUG = "konsultasi-dokter";

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireCapability("booking:manage");
  const params = await searchParams;

  const [branches, categories, staffList, setting, prefill, onlineService] = await Promise.all([
    getBranches(),
    getServiceCategoriesWithServices(),
    listSchedulableStaff(),
    getClinicSetting(),
    resolveBookingPrefill({ pasien: one(params.pasien), tenaga: one(params.tenaga), tanggal: one(params.tanggal), jam: one(params.jam) }),
    loadOnlineService(),
  ]);

  const activeBranches = branches.filter((b) => b.status === "AKTIF");
  const online = one(params.jenis) === "online" && onlineService !== null;
  const doctors = staffList.filter((s) => s.role === "DOKTER").map((s) => ({ id: s.id, name: s.name }));
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
        {onlineService && (
          <PageTabs
            label="Jenis konsultasi"
            active={online ? "online" : "klinik"}
            tabs={[
              { id: "klinik", label: "Konsultasi di klinik", href: "/admin/booking/baru" },
              { id: "online", label: "Konsultasi online", href: "/admin/booking/baru?jenis=online" },
            ]}
          />
        )}
        {online && onlineService ? (
          doctors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada dokter yang dapat dijadwalkan.</p>
          ) : (
            <OnlineAppointmentForm
              doctors={doctors}
              today={witaDateString(new Date())}
              bookingFee={setting.bookingFee}
              servicePrice={onlineService.promoPrice}
              initialPatient={prefill.initial?.patient ?? null}
            />
          )
        ) : activeBranches.length === 0 || staffList.length === 0 ? (
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

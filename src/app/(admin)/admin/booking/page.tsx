import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { BookingFilters } from "@/components/admin/booking-filters";
import { Button } from "@/components/ui/button";
import { isAppointmentStatus } from "@/lib/appointment-status";
import { formatIndonesianDate } from "@/lib/format";
import {
  addDaysToDateString,
  combineWitaDateAndMinutes,
  minutesToTimeLabel,
  witaDateString,
  witaMinutesOfDay,
} from "@/lib/time";
import { buildWhatsAppLinkTo, patientBookingConfirmationMessage } from "@/lib/whatsapp";
import { listAppointments } from "@/server/appointment";
import { getBranches } from "@/server/catalog";
import { listSchedulableStaff } from "@/server/schedule";
import { requireCapability } from "@/server/session";

const SOURCE_LABEL: Record<string, string> = {
  SITUS: "Situs",
  WHATSAPP: "WhatsApp",
  TELEPON: "Telepon",
  WALK_IN: "Walk-in",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function timeLabel(date: Date): string {
  return minutesToTimeLabel(witaMinutesOfDay(date));
}

export default async function BookingListPage({
  searchParams,
}: {
  searchParams: Promise<{ tanggal?: string; status?: string; staf?: string; cabang?: string }>;
}) {
  await requireCapability("booking:manage");
  const params = await searchParams;

  const today = witaDateString(new Date());
  const date = params.tanggal && DATE_PATTERN.test(params.tanggal) ? params.tanggal : today;
  const status = isAppointmentStatus(params.status) ? params.status : null;

  const [appointments, staffList, branches] = await Promise.all([
    listAppointments({
      date,
      status: status ?? undefined,
      staffId: params.staf || undefined,
      branchId: params.cabang || undefined,
    }),
    listSchedulableStaff(),
    getBranches(),
  ]);

  // Label tanggal dari tengah hari WITA, agar tidak bergeser ke hari lain.
  const dateLabel = formatIndonesianDate(combineWitaDateAndMinutes(date, 12 * 60));

  const rows: BookingRow[] = appointments.map((a) => {
    const serviceName = a.service?.name ?? (a.type === "KONSULTASI" ? "Konsultasi" : "Treatment");
    const start = timeLabel(a.startAt);
    const confirmationText =
      a.status === "TERKONFIRMASI"
        ? patientBookingConfirmationMessage({
            patientName: a.patient.name,
            code: a.code,
            serviceName,
            staffName: a.staff.name,
            branchName: a.branch.name,
            dateLabel,
            timeLabel: start,
          })
        : null;

    return {
      id: a.id,
      code: a.code,
      status: a.status,
      timeLabel: `${start}–${timeLabel(a.endAt)}`,
      patientName: a.patient.name,
      patientRecordNumber: a.patient.medicalRecordNumber,
      serviceName,
      staffName: a.staff.name,
      branchName: a.branch.name,
      sourceLabel: SOURCE_LABEL[a.source] ?? a.source,
      notes: a.notes,
      confirmation: confirmationText
        ? {
            text: confirmationText,
            link: buildWhatsAppLinkTo(a.patient.whatsapp, confirmationText),
          }
        : null,
    };
  });

  const dayLink = (d: string) => {
    const next = new URLSearchParams({ tanggal: d });
    if (status) next.set("status", status);
    if (params.staf) next.set("staf", params.staf);
    if (params.cabang) next.set("cabang", params.cabang);
    return `/admin/booking?${next.toString()}`;
  };

  return (
    <>
      <AdminHeader title="Booking" />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={dayLink(addDaysToDateString(date, -1))} aria-label="Hari sebelumnya">
                ‹
              </Link>
            </Button>
            <h2 className="text-lg font-medium">{dateLabel}</h2>
            <Button asChild variant="outline" size="sm">
              <Link href={dayLink(addDaysToDateString(date, 1))} aria-label="Hari berikutnya">
                ›
              </Link>
            </Button>
            {date !== today && (
              <Button asChild variant="ghost" size="sm">
                <Link href={dayLink(today)}>Hari ini</Link>
              </Button>
            )}
          </div>
          <Button asChild>
            <Link href="/admin/booking/baru">+ Booking Baru</Link>
          </Button>
        </div>

        <BookingFilters
          date={date}
          status={status}
          staffId={params.staf || null}
          branchId={params.cabang || null}
          staff={staffList.map((s) => ({ id: s.id, name: s.name }))}
          branches={branches
            .filter((b) => b.status === "AKTIF")
            .map((b) => ({ id: b.id, name: b.name }))}
        />

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tidak ada booking{status ? " dengan status ini" : ""} pada tanggal ini.
          </p>
        ) : (
          <AppointmentTable rows={rows} />
        )}
      </div>
    </>
  );
}

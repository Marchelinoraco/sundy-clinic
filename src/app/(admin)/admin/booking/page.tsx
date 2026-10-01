import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { BookingFilters } from "@/components/admin/booking-filters";
import { Button } from "@/components/ui/button";
import { isAppointmentStatus } from "@/lib/appointment-status";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import type { BankAccount } from "@/lib/payment";
import { can } from "@/lib/permissions";
import {
  addDaysToDateString,
  combineWitaDateAndMinutes,
  minutesToTimeLabel,
  witaDateString,
  witaMinutesOfDay,
} from "@/lib/time";
import { bookingServiceName, pendingDeadlineLabel, transferInstructionFor } from "@/lib/transfer-instruction";
import { buildWhatsAppLinkTo, patientBookingConfirmationMessage } from "@/lib/whatsapp";
import { listAppointments, listPendingBookings } from "@/server/appointment";
import { getBranches } from "@/server/catalog";
import { getClinicSetting } from "@/server/clinic-setting";
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

type ListedAppointment = Awaited<ReturnType<typeof listAppointments>>[number];

function toRow(a: ListedAppointment, bank: BankAccount): BookingRow {
  const serviceName = bookingServiceName(a);
  const start = timeLabel(a.startAt);
  // Booking situs boleh belum punya pasien sampai admin mencocokkannya;
  // CHECK di basis data menjamin booking terkonfirmasi selalu punya pasien.
  const patient = a.patient;
  const confirmationText =
    a.status === "TERKONFIRMASI" && patient
      ? patientBookingConfirmationMessage({
          patientName: patient.name,
          code: a.code,
          serviceName,
          staffName: a.staff.name,
          branchName: a.branch.name,
          dateLabel: formatIndonesianDate(a.startAt),
          timeLabel: start,
        })
      : null;
  const transfer = transferInstructionFor(a, bank);

  return {
    id: a.id,
    code: a.code,
    status: a.status,
    timeLabel: `${start}–${timeLabel(a.endAt)}`,
    patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
    patientRecordNumber: patient?.medicalRecordNumber ?? "—",
    needsMatch: patient === null,
    isSiteBooking: a.source === "SITUS" && a.intake !== null,
    intakeId: a.intake?.id ?? null,
    intakeStatus: a.intake?.status ?? null,
    patientId: patient?.id ?? null,
    serviceName,
    staffName: a.staff.name,
    branchName: a.branch.name,
    source: a.source,
    sourceLabel: SOURCE_LABEL[a.source] ?? a.source,
    notes: a.notes,
    confirmation:
      confirmationText && patient
        ? {
            text: confirmationText,
            link: buildWhatsAppLinkTo(patient.whatsapp, confirmationText),
          }
        : null,
    transferInstruction: transfer ? { text: transfer.text, link: transfer.link } : null,
  };
}

export default async function BookingListPage({
  searchParams,
}: {
  searchParams: Promise<{ tanggal?: string; status?: string; staf?: string; cabang?: string; isian?: string }>;
}) {
  const staff = await requireCapability("booking:manage");
  const params = await searchParams;

  const today = witaDateString(new Date());
  const date = params.tanggal && DATE_PATTERN.test(params.tanggal) ? params.tanggal : today;
  const status = isAppointmentStatus(params.status) ? params.status : null;
  // Filter isian berlaku untuk semua tanggal: isian lama pun harus terlihat (spec 6.5).
  const unreviewedOnly = params.isian === "belum-diperiksa";

  const [appointments, pending, staffList, branches, setting] = await Promise.all([
    listAppointments({
      date: unreviewedOnly ? undefined : date,
      status: status ?? undefined,
      staffId: params.staf || undefined,
      branchId: params.cabang || undefined,
      intakeStatus: unreviewedOnly ? "TERISI" : undefined,
    }),
    listPendingBookings(),
    listSchedulableStaff(),
    getBranches(),
    getClinicSetting(),
  ]);

  // Label tanggal dari tengah hari WITA, agar tidak bergeser ke hari lain.
  const dateLabel = formatIndonesianDate(combineWitaDateAndMinutes(date, 12 * 60));

  const rows = appointments.map((a) => {
    const row = toRow(a, setting);
    // Tanpa batas tanggal: jam jadwal ditulis bersama tanggalnya.
    return unreviewedOnly ? { ...row, timeLabel: `${formatShortIndonesianDate(a.startAt)} · ${row.timeLabel}` } : row;
  });
  // Semua tanggal sekaligus: jam jadwal ditulis bersama tanggalnya.
  const pendingRows: BookingRow[] = pending.map((a) => {
    const row = toRow(a, setting);
    return {
      ...row,
      timeLabel: `${formatShortIndonesianDate(a.startAt)} · ${row.timeLabel}`,
      deadlineLabel: pendingDeadlineLabel({ kind: a.deadlineKind, deadline: a.deadline, overdue: a.overdue }),
      deadlineOverdue: a.overdue,
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
        {pendingRows.length > 0 && (
          <section
            aria-labelledby="booking-situs-menunggu"
            className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/60 p-4"
          >
            <div>
              <h2 id="booking-situs-menunggu" className="text-lg font-medium">
                Booking situs menunggu konfirmasi ({pendingRows.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                Semua tanggal, yang paling dekat kedaluwarsa di atas. Cocokkan pasiennya, lalu verifikasi
                setelah bukti transfer diterima. Hari Minggu dan hari libur tidak dihitung.
              </p>
            </div>
            <AppointmentTable rows={pendingRows} canReadRecords={can(staff.role, "record:read")} />
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {unreviewedOnly ? (
            <h2 className="text-lg font-medium">Isian belum diperiksa · semua tanggal</h2>
          ) : (
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
          )}
          <Button asChild>
            <Link href="/admin/booking/baru">+ Booking Baru</Link>
          </Button>
        </div>

        <BookingFilters
          date={date}
          status={status}
          staffId={params.staf || null}
          branchId={params.cabang || null}
          intake={unreviewedOnly ? "belum-diperiksa" : null}
          staff={staffList.map((s) => ({ id: s.id, name: s.name }))}
          branches={branches
            .filter((b) => b.status === "AKTIF")
            .map((b) => ({ id: b.id, name: b.name }))}
        />

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {unreviewedOnly
              ? "Tidak ada isian yang menunggu diperiksa."
              : `Tidak ada booking${status ? " dengan status ini" : ""} pada tanggal ini.`}
          </p>
        ) : (
          <AppointmentTable rows={rows} canReadRecords={can(staff.role, "record:read")} />
        )}
      </div>
    </>
  );
}

import Form from "next/form";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { BookingDialogsProvider } from "@/components/admin/booking-dialogs";
import { BookingFilters } from "@/components/admin/booking-filters";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAppointmentStatus } from "@/lib/appointment-status";
import { confirmationMessageFor } from "@/lib/booking-messages";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import type { BankAccount } from "@/lib/payment";
import { can } from "@/lib/permissions";
import { messageStatusLabels } from "@/lib/reminder-work";
import {
  addDaysToDateString,
  combineWitaDateAndMinutes,
  minutesToTimeLabel,
  witaDateString,
  witaMinutesOfDay,
} from "@/lib/time";
import { bookingServiceName, pendingDeadlineLabel, transferInstructionFor } from "@/lib/transfer-instruction";
import { listAppointments, listPendingBookings, searchBookings } from "@/server/appointment";
import { getBranches } from "@/server/catalog";
import { getClinicSetting } from "@/server/clinic-setting";
import { quizLinkFor } from "@/server/quiz-link-code";
import { listSchedulableStaff } from "@/server/schedule";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

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
type RowContext = { bank: BankAccount; siteUrl: string; now: Date };

function toRow(a: ListedAppointment, context: RowContext): BookingRow {
  // Booking situs boleh belum punya pasien sampai admin mencocokkannya;
  // CHECK di basis data menjamin booking terkonfirmasi selalu punya pasien.
  const patient = a.patient;
  const quizLink = quizLinkFor(a, context.siteUrl, context.now);
  const confirmation = a.status === "TERKONFIRMASI" ? confirmationMessageFor(a, context.siteUrl, quizLink) : null;
  const transfer = transferInstructionFor(a, context.bank, quizLink);

  return {
    id: a.id,
    code: a.code,
    status: a.status,
    timeLabel: `${timeLabel(a.startAt)}–${timeLabel(a.endAt)}`,
    patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
    patientRecordNumber: patient?.medicalRecordNumber ?? "—",
    needsMatch: patient === null,
    isSiteBooking: a.source === "SITUS" && a.intake !== null,
    intakeId: a.intake?.id ?? null,
    // Booking admin yang linknya berlaku belum tentu punya baris isian: tetap "Isian: belum diisi" (spec C3 4.3).
    intakeStatus: a.intake?.status ?? (quizLink ? "MENUNGGU_DIISI" : null),
    patientId: patient?.id ?? null,
    serviceName: bookingServiceName(a),
    staffName: a.staff.name,
    branchName: a.branch.name,
    source: a.source,
    sourceLabel: SOURCE_LABEL[a.source] ?? a.source,
    notes: a.notes,
    confirmation,
    transferInstruction: transfer ? { text: transfer.text, link: transfer.link } : null,
    messageNotes: messageStatusLabels(a.messages, a.startAt, context.now),
    reschedule: {
      appointmentId: a.id,
      code: a.code,
      patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
      startAt: a.startAt,
      durationMinutes: Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60_000),
      staffId: a.staffId,
      staffName: a.staff.name,
      branchId: a.branchId,
      branchName: a.branch.name,
    },
    quizLink,
    needsFullIntake:
      a.source === "SITUS" && a.intake?.kind === "PENDEK" && patient !== null && patient.intakes.length === 0,
  };
}

/** Daftar tanpa batas satu tanggal: jam jadwal ditulis bersama tanggalnya. */
function withDate(row: BookingRow, startAt: Date): BookingRow {
  return { ...row, timeLabel: `${formatShortIndonesianDate(startAt)} · ${row.timeLabel}` };
}

export default async function BookingListPage({
  searchParams,
}: {
  searchParams: Promise<{
    tanggal?: string;
    status?: string;
    staf?: string;
    cabang?: string;
    isian?: string;
    cari?: string;
    sorot?: string;
  }>;
}) {
  const staff = await requireCapability("booking:manage");
  const params = await searchParams;
  const canReadRecords = can(staff.role, "record:read");

  const now = new Date();
  const today = witaDateString(now);
  const date = params.tanggal && DATE_PATTERN.test(params.tanggal) ? params.tanggal : today;
  const status = isAppointmentStatus(params.status) ? params.status : null;
  // Filter isian berlaku untuk semua tanggal: isian lama pun harus terlihat (spec 6.5).
  const unreviewedOnly = params.isian === "belum-diperiksa";
  // Selama kotak cari berisi, daftar per tanggal dan filternya disembunyikan (spec C1 5.3).
  const query = params.cari?.trim() ?? "";

  const [appointments, pending, found, staffList, branches, setting] = await Promise.all([
    query
      ? Promise.resolve([] as ListedAppointment[])
      : listAppointments({
          date: unreviewedOnly ? undefined : date,
          status: status ?? undefined,
          staffId: params.staf || undefined,
          branchId: params.cabang || undefined,
          intakeStatus: unreviewedOnly ? "TERISI" : undefined,
        }),
    listPendingBookings(),
    query ? searchBookings(query) : Promise.resolve([] as ListedAppointment[]),
    listSchedulableStaff(),
    getBranches(),
    getClinicSetting(),
  ]);
  const context: RowContext = { bank: setting, siteUrl: publicSiteUrl(), now };

  // Label tanggal dari tengah hari WITA, agar tidak bergeser ke hari lain.
  const dateLabel = formatIndonesianDate(combineWitaDateAndMinutes(date, 12 * 60));

  const rows = appointments.map((a) => (unreviewedOnly ? withDate(toRow(a, context), a.startAt) : toRow(a, context)));
  const pendingRows: BookingRow[] = pending.map((a) => ({
    ...withDate(toRow(a, context), a.startAt),
    deadlineLabel: pendingDeadlineLabel({ kind: a.deadlineKind, deadline: a.deadline, overdue: a.overdue }),
    deadlineOverdue: a.overdue,
  }));
  const foundRows = found.map((a) => withDate(toRow(a, context), a.startAt));

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
      {/* Dialog setelah Verifikasi dan Pindah jadwal tetap terbuka walau barisnya keluar dari daftar. */}
      <BookingDialogsProvider today={today}>
      <PageBody>
        <PageHeader
          title="Booking"
          description={query ? `Hasil pencarian “${query}”` : unreviewedOnly ? "Isian belum diperiksa · semua tanggal" : dateLabel}
          actions={
            <Button asChild>
              <Link href="/admin/booking/baru">+ Booking Baru</Link>
            </Button>
          }
        />
        {pendingRows.length > 0 && (
          <section
            aria-labelledby="booking-menunggu"
            className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/60 p-4"
          >
            <div>
              <h2 id="booking-menunggu" className="text-lg font-medium">
                Menunggu konfirmasi ({pendingRows.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                Semua tanggal, yang paling mendesak di atas. Verifikasi setelah bukti transfer diterima. Booking
                situs kedaluwarsa sendiri; booking WhatsApp dan telepon tidak, batas transfernya hanya pengingat.
                Hari Minggu dan hari libur tidak dihitung.
              </p>
            </div>
            <AppointmentTable rows={pendingRows} canReadRecords={canReadRecords} />
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Form action="/admin/booking" role="search" className="flex w-full max-w-md gap-2">
            <Input
              key={query}
              name="cari"
              defaultValue={query}
              placeholder="Cari kode, nama, atau WA"
              aria-label="Cari kode, nama, atau WA"
              autoComplete="off"
            />
            <Button type="submit" variant="outline">
              Cari
            </Button>
          </Form>
        </div>

        {query ? (
          <section aria-labelledby="hasil-cari" className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="hasil-cari" className="text-lg font-medium">
                Hasil pencarian “{query}” ({foundRows.length})
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/booking">Kembali ke daftar per tanggal</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Jadwal 30 hari ke belakang sampai seterusnya, terbaru di atas, paling banyak 50 booking.
            </p>
            {foundRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada booking yang cocok.</p>
            ) : (
              <AppointmentTable rows={foundRows} canReadRecords={canReadRecords} />
            )}
          </section>
        ) : (
          <>
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
              <AppointmentTable
                rows={rows}
                canReadRecords={canReadRecords}
                highlightId={params.sorot ?? null}
              />
            )}
          </>
        )}
      </PageBody>
      </BookingDialogsProvider>
    </>
  );
}

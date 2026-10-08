import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Form from "next/form";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppointmentTable, type BookingRow } from "@/components/admin/appointment-table";
import { BookingDialogsProvider } from "@/components/admin/booking-dialogs";
import { BookingFilters } from "@/components/admin/booking-filters";
import { LinkButton } from "@/components/admin/mui/links";
import { PageBody, PageHeader } from "@/components/admin/page-layout";
import { isAppointmentStatus } from "@/lib/appointment-status";
import { showsContactWindows } from "@/lib/booking-actions";
import { confirmationMessageFor, requestNewTimeMessageFor } from "@/lib/booking-messages";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import { lastAttemptLabel, onlinePhase, placeLabel, windowDrafts, windowLines } from "@/lib/online-consultation";
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
import { listAppointments, listOnlineBookings, listPendingBookings, searchBookings } from "@/server/appointment";
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
    // Booking online yang belum dimulai belum punya jam; sesudah dimulai memakai jam sebenarnya (spec 3.5).
    timeLabel:
      a.channel === "ONLINE" && a.status !== "HADIR" && a.status !== "SELESAI"
        ? "Online"
        : `${timeLabel(a.startAt)}–${timeLabel(a.endAt)}`,
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
    branchName: placeLabel(a.channel, a.branch.name),
    channel: a.channel,
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
    foodRecall: a.foodRecall?.status ?? null,
    foodRecallAvailable:
      a.status === "HADIR" && witaDateString(a.startAt) === witaDateString(context.now) && a.encounter?.status !== "FINAL",
    online:
      a.channel === "ONLINE"
        ? {
            windowLines: windowLines(a.contactWindows),
            phase: a.status === "TERKONFIRMASI" ? onlinePhase(a.contactWindows, context.now) : null,
            lastAttempt: lastAttemptLabel(a.contactAttempts),
            requestNewTime:
              a.status === "TERKONFIRMASI" && onlinePhase(a.contactWindows, context.now) === "NEEDS_NEW"
                ? { link: requestNewTimeMessageFor(a)?.link ?? null }
                : null,
            contactWindows: {
              appointmentId: a.id,
              code: a.code,
              patientName: patient?.name ?? a.intake?.name ?? "Tanpa nama",
              windows: windowDrafts(a.contactWindows),
            },
          }
        : null,
  };
}

/** Daftar tanpa batas satu tanggal: jam jadwal ditulis bersama tanggalnya. Booking online yang belum dimulai tidak punya jam. */
function withDate(row: BookingRow, startAt: Date): BookingRow {
  if (showsContactWindows(row)) return row;
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

  const [appointments, pending, found, staffList, branches, setting, onlineBookings] = await Promise.all([
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
    listOnlineBookings(),
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
  const onlineRows = onlineBookings.map((a) => toRow(a, context));
  // Sorotan di bagian Menunggu konfirmasi hanya bila barisnya tidak juga ada di daftar per tanggal
  // (booking online belum punya jam, jadi hanya tampil di sana); tanpa ini baris tersorot dua kali.
  const pendingHighlight = rows.some((row) => row.id === params.sorot) ? null : (params.sorot ?? null);
  const foundRows = found.map((a) => withDate(toRow(a, context), a.startAt));

  const dayLink = (d: string) => {
    const next = new URLSearchParams({ tanggal: d });
    if (status) next.set("status", status);
    if (params.staf) next.set("staf", params.staf);
    if (params.cabang) next.set("cabang", params.cabang);
    return `/admin/booking?${next.toString()}`;
  };

  const heading = { fontSize: "1.125rem", fontWeight: 500 } as const;
  const muted = { color: "text.secondary" } as const;

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
              <LinkButton href="/admin/booking/baru" variant="contained">
                + Booking Baru
              </LinkButton>
            }
          />
          {pendingRows.length > 0 && (
            <Box
              component="section"
              aria-labelledby="booking-menunggu"
              sx={{ display: "flex", flexDirection: "column", gap: 1.5, borderRadius: 2, border: 1, borderColor: "warning.main", bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.06)", p: 2 }}
            >
              <div>
                <Typography component="h2" id="booking-menunggu" sx={heading}>
                  Menunggu konfirmasi ({pendingRows.length})
                </Typography>
                <Typography variant="body2" sx={muted}>
                  Semua tanggal, yang paling mendesak di atas. Verifikasi setelah bukti transfer diterima. Booking situs kedaluwarsa sendiri;
                  booking WhatsApp dan telepon tidak, batas transfernya hanya pengingat. Hari Minggu dan hari libur tidak dihitung.
                </Typography>
              </div>
              <AppointmentTable rows={pendingRows} canReadRecords={canReadRecords} highlightId={pendingHighlight} />
            </Box>
          )}

          {onlineRows.length > 0 && !query && (
            <Box
              component="section"
              aria-labelledby="booking-online"
              sx={{ display: "flex", flexDirection: "column", gap: 1.5, borderRadius: 2, border: 1, borderColor: "info.main", bgcolor: "rgba(var(--mui-palette-info-mainChannel) / 0.06)", p: 2 }}
            >
              <div>
                <Typography component="h2" id="booking-online" sx={heading}>
                  Konsultasi online ({onlineRows.length})
                </Typography>
                <Typography variant="body2" sx={muted}>
                  Sudah diverifikasi dan menunggu dihubungi dokter. Yang waktunya sudah lewat ada di atas.
                </Typography>
              </div>
              <AppointmentTable rows={onlineRows} canReadRecords={canReadRecords} highlightId={params.sorot ?? null} />
            </Box>
          )}

          <Form action="/admin/booking" role="search">
            <Stack direction="row" spacing={1} sx={{ width: "100%", maxWidth: 448 }}>
              <TextField
                key={query}
                name="cari"
                defaultValue={query}
                placeholder="Cari kode, nama, atau WA"
                autoComplete="off"
                slotProps={{ htmlInput: { "aria-label": "Cari kode, nama, atau WA" } }}
                fullWidth
              />
              <Button type="submit" variant="outlined">
                Cari
              </Button>
            </Stack>
          </Form>

          {query ? (
            <Box component="section" aria-labelledby="hasil-cari" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                <Typography component="h2" id="hasil-cari" sx={heading}>
                  Hasil pencarian “{query}” ({foundRows.length})
                </Typography>
                <LinkButton href="/admin/booking" variant="text" size="small">
                  Kembali ke daftar per tanggal
                </LinkButton>
              </Stack>
              <Typography variant="body2" sx={muted}>
                Jadwal 30 hari ke belakang sampai seterusnya, terbaru di atas, paling banyak 50 booking.
              </Typography>
              {foundRows.length === 0 ? (
                <Typography variant="body2" sx={muted}>
                  Tidak ada booking yang cocok.
                </Typography>
              ) : (
                <AppointmentTable rows={foundRows} canReadRecords={canReadRecords} />
              )}
            </Box>
          ) : (
            <>
              {unreviewedOnly ? (
                <Typography component="h2" sx={heading}>
                  Isian belum diperiksa · semua tanggal
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <LinkButton href={dayLink(addDaysToDateString(date, -1))} variant="outlined" size="small" aria-label="Hari sebelumnya" sx={{ minWidth: 36, px: 0 }}>
                    <ChevronLeft fontSize="small" />
                  </LinkButton>
                  <Typography component="h2" sx={heading}>
                    {dateLabel}
                  </Typography>
                  <LinkButton href={dayLink(addDaysToDateString(date, 1))} variant="outlined" size="small" aria-label="Hari berikutnya" sx={{ minWidth: 36, px: 0 }}>
                    <ChevronRight fontSize="small" />
                  </LinkButton>
                  {date !== today && (
                    <LinkButton href={dayLink(today)} variant="text" size="small">
                      Hari ini
                    </LinkButton>
                  )}
                </Stack>
              )}

              <BookingFilters
                date={date}
                status={status}
                staffId={params.staf || null}
                branchId={params.cabang || null}
                intake={unreviewedOnly ? "belum-diperiksa" : null}
                staff={staffList.map((s) => ({ id: s.id, name: s.name }))}
                branches={branches.filter((b) => b.status === "AKTIF").map((b) => ({ id: b.id, name: b.name }))}
              />

              {rows.length === 0 ? (
                <Typography variant="body2" sx={muted}>
                  {unreviewedOnly ? "Tidak ada isian yang menunggu diperiksa." : `Tidak ada booking${status ? " dengan status ini" : ""} pada tanggal ini.`}
                </Typography>
              ) : (
                <AppointmentTable rows={rows} canReadRecords={canReadRecords} highlightId={params.sorot ?? null} />
              )}
            </>
          )}
        </PageBody>
      </BookingDialogsProvider>
    </>
  );
}

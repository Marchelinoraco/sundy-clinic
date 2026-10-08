import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { timelineAxis, timelineHours, timelinePosition, timelineTone, type TimelineTone } from "@/lib/dashboard";
import type { TodaySchedule } from "@/server/dashboard";
import { TextLink } from "./mui/links";
import { EmptyState, SectionCard } from "./page-layout";

// Warna lajur dari tema, sehingga terbaca di skema terang dan gelap.
const TONE_SX: Record<TimelineTone, object> = {
  menunggu: { border: "1px dashed", borderColor: "primary.main", bgcolor: "background.paper", color: "text.primary" },
  terkonfirmasi: { bgcolor: "primary.main", color: "primary.contrastText" },
  hadir: { bgcolor: "success.main", color: "success.contrastText" },
  "tidak-hadir": { bgcolor: "action.selected", color: "text.secondary", textDecoration: "line-through" },
};

const TONE_LABEL: Record<TimelineTone, string> = {
  menunggu: "menunggu konfirmasi",
  terkonfirmasi: "terkonfirmasi",
  hadir: "hadir",
  "tidak-hadir": "tidak hadir",
};

const percent = (p: { left: number; width: number }) => ({ left: `${p.left}%`, width: `${p.width}%` });

/** Garis waktu jadwal hari ini, satu lajur per tenaga (spec D 4.3, keputusan D4 & D7). */
export function ScheduleTimeline({ schedule, nowMinute }: { schedule: TodaySchedule; nowMinute: number }) {
  const actions = <TextLink href={`/admin/booking?tanggal=${schedule.date}`}>Buka daftar Booking →</TextLink>;
  if (schedule.holidayName && schedule.lanes.length === 0) {
    return (
      <SectionCard title="Jadwal hari ini" actions={actions}>
        <EmptyState>Klinik tutup hari ini — {schedule.holidayName}.</EmptyState>
      </SectionCard>
    );
  }
  const axis = timelineAxis(schedule.lanes.flatMap((lane) => [...lane.windows, ...lane.bookings]));
  if (!axis) {
    return (
      <SectionCard title="Jadwal hari ini" actions={actions}>
        <EmptyState>Tidak ada jadwal praktik hari ini.</EmptyState>
      </SectionCard>
    );
  }
  const span = axis.endMinute - axis.startMinute;
  const nowLeft = nowMinute >= axis.startMinute && nowMinute <= axis.endMinute ? ((nowMinute - axis.startMinute) / span) * 100 : null;

  return (
    <SectionCard title="Jadwal hari ini" actions={actions} flush>
      <Box sx={{ minWidth: 640, p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {schedule.holidayName && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Klinik tutup hari ini — {schedule.holidayName}. Booking yang masih tercatat:
          </Typography>
        )}
        <Box aria-hidden sx={{ ml: 20, display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "text.secondary" }}>
          {timelineHours(axis).map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}</span>
          ))}
        </Box>
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {schedule.lanes.map((lane) => (
            <Box component="li" key={lane.staffId} aria-label={`Jadwal ${lane.staffName}`} sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ width: 144, flexShrink: 0, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 500 }}>
                  {lane.staffName}
                </Typography>
                <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                  {lane.bookings.length} booking · {lane.openSlots.length} slot kosong
                </Typography>
              </Box>
              <Box sx={{ position: "relative", height: 36, flex: 1, borderRadius: 1.5, bgcolor: "action.hover" }}>
                {lane.windows.map((window) => {
                  const p = timelinePosition(window.startMinute, window.endMinute, axis);
                  return p ? (
                    <Box
                      key={`w-${window.startMinute}`}
                      aria-hidden
                      sx={{ position: "absolute", top: 0, bottom: 0, borderRadius: 1.5, bgcolor: "background.paper", border: 1, borderColor: "divider", ...percent(p) }}
                    />
                  ) : null;
                })}
                {lane.openSlots.map((slot) => {
                  const p = timelinePosition(slot.startMinute, slot.endMinute, axis);
                  return p ? (
                    <TextLink
                      key={`s-${slot.startMinute}`}
                      href={`/admin/booking/baru?tenaga=${lane.staffId}&tanggal=${schedule.date}&jam=${slot.time}`}
                      aria-label={`Slot kosong ${slot.time} — buat booking ${lane.staffName}`}
                      title={`${slot.time} kosong — buat booking`}
                      sx={{
                        position: "absolute",
                        top: 4,
                        bottom: 4,
                        borderRadius: 1,
                        border: 1,
                        borderColor: "rgba(var(--mui-palette-primary-mainChannel) / 0.5)",
                        "&:hover": { bgcolor: "rgba(var(--mui-palette-primary-mainChannel) / 0.2)" },
                        ...percent(p),
                      }}
                    >
                      {null}
                    </TextLink>
                  ) : null;
                })}
                {lane.bookings.map((booking) => {
                  const tone = timelineTone(booking.status);
                  const p = timelinePosition(booking.startMinute, booking.endMinute, axis);
                  if (!tone || !p) return null;
                  const label = `${booking.time} ${booking.patientName} · ${booking.serviceName} · ${TONE_LABEL[tone]}`;
                  return (
                    <TextLink
                      key={booking.id}
                      href={`/admin/booking?tanggal=${schedule.date}&sorot=${booking.id}`}
                      aria-label={label}
                      title={label}
                      underline="none"
                      sx={{
                        position: "absolute",
                        top: 4,
                        bottom: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        borderRadius: 1,
                        px: 0.5,
                        fontSize: "0.75rem",
                        lineHeight: "28px",
                        ...TONE_SX[tone],
                        ...percent(p),
                      }}
                    >
                      {booking.patientName}
                    </TextLink>
                  );
                })}
                {nowLeft !== null && (
                  <Box data-now aria-hidden sx={{ position: "absolute", top: 0, bottom: 0, width: "1px", bgcolor: "error.main", left: `${nowLeft}%` }} />
                )}
              </Box>
            </Box>
          ))}
        </Box>
        {schedule.offStaff.length > 0 && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Tidak praktik hari ini: {schedule.offStaff.join(", ")}
          </Typography>
        )}
      </Box>
    </SectionCard>
  );
}

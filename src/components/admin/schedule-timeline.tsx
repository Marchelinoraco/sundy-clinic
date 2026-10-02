import Link from "next/link";
import { timelineAxis, timelineHours, timelinePosition, timelineTone, type TimelineTone } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import type { TodaySchedule } from "@/server/dashboard";
import { EmptyState, SectionCard } from "./page-layout";

const TONE_CLASS: Record<TimelineTone, string> = {
  menunggu: "border border-dashed border-gold-500 bg-white text-gold-600",
  terkonfirmasi: "bg-gold-300 text-brown-900",
  hadir: "bg-emerald-200 text-emerald-900",
  "tidak-hadir": "bg-stone-200 text-stone-600 line-through",
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
  const actions = (
    <Link href={`/admin/booking?tanggal=${schedule.date}`} className="text-gold-600 underline-offset-4 hover:underline">
      Buka daftar Booking →
    </Link>
  );
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
      <div className="min-w-[40rem] space-y-3 p-4">
        {schedule.holidayName && (
          <p className="text-sm text-muted-foreground">Klinik tutup hari ini — {schedule.holidayName}. Booking yang masih tercatat:</p>
        )}
        <div className="ml-40 flex justify-between text-xs text-muted-foreground" aria-hidden>
          {timelineHours(axis).map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}</span>
          ))}
        </div>
        <ul className="space-y-3">
          {schedule.lanes.map((lane) => (
            <li key={lane.staffId} aria-label={`Jadwal ${lane.staffName}`} className="flex items-center gap-4">
              <div className="w-36 shrink-0">
                <div className="truncate font-medium">{lane.staffName}</div>
                <div className="text-xs text-muted-foreground">
                  {lane.bookings.length} booking · {lane.openSlots.length} slot kosong
                </div>
              </div>
              <div className="relative h-9 flex-1 rounded-md bg-cream-100">
                {lane.windows.map((window) => {
                  const p = timelinePosition(window.startMinute, window.endMinute, axis);
                  return p ? (
                    <div key={`w-${window.startMinute}`} aria-hidden className="absolute inset-y-0 rounded-md bg-white ring-1 ring-cream-300" style={percent(p)} />
                  ) : null;
                })}
                {lane.openSlots.map((slot) => {
                  const p = timelinePosition(slot.startMinute, slot.endMinute, axis);
                  return p ? (
                    <Link
                      key={`s-${slot.startMinute}`}
                      href={`/admin/booking/baru?tenaga=${lane.staffId}&tanggal=${schedule.date}&jam=${slot.time}`}
                      aria-label={`Slot kosong ${slot.time} — buat booking ${lane.staffName}`}
                      title={`${slot.time} kosong — buat booking`}
                      className="absolute inset-y-1 rounded border border-gold-300/70 hover:bg-gold-300/30"
                      style={percent(p)}
                    />
                  ) : null;
                })}
                {lane.bookings.map((booking) => {
                  const tone = timelineTone(booking.status);
                  const p = timelinePosition(booking.startMinute, booking.endMinute, axis);
                  if (!tone || !p) return null;
                  const label = `${booking.time} ${booking.patientName} · ${booking.serviceName} · ${TONE_LABEL[tone]}`;
                  return (
                    <Link
                      key={booking.id}
                      href={`/admin/booking?tanggal=${schedule.date}&sorot=${booking.id}`}
                      aria-label={label}
                      title={label}
                      className={cn("absolute inset-y-1 truncate rounded px-1 text-xs leading-7", TONE_CLASS[tone])}
                      style={percent(p)}
                    >
                      {booking.patientName}
                    </Link>
                  );
                })}
                {nowLeft !== null && (
                  <div data-now aria-hidden className="absolute inset-y-0 w-px bg-red-500" style={{ left: `${nowLeft}%` }} />
                )}
              </div>
            </li>
          ))}
        </ul>
        {schedule.offStaff.length > 0 && (
          <p className="text-xs text-muted-foreground">Tidak praktik hari ini: {schedule.offStaff.join(", ")}</p>
        )}
      </div>
    </SectionCard>
  );
}

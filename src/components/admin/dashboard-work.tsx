import type { TodayWork } from "@/server/dashboard";
import { StatTile } from "./stat-tile";

/** Kotak pekerjaan hari ini (spec D 4.2). */
export function DashboardWork({ work, today }: { work: TodayWork; today: string }) {
  const messages = work.messages.confirm + work.messages.remind;
  const dayList = `/admin/booking?tanggal=${today}`;
  return (
    <section aria-label="Pekerjaan hari ini" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Menunggu konfirmasi"
        value={work.pending}
        note={work.pendingOverdue > 0 ? `${work.pendingOverdue} lewat batas transfer` : null}
        href="/admin/booking"
        attention={work.pending > 0}
      />
      <StatTile
        label="Pesan WA belum dikirim"
        value={messages}
        note={`konfirmasi ${work.messages.confirm} · pengingat ${work.messages.remind}`}
        href="/admin/pengingat"
        attention={messages > 0}
      />
      <StatTile
        label="Booking hari ini"
        value={work.today.total}
        note={work.today.unfilledIntakes > 0 ? `${work.today.unfilledIntakes} isian belum diisi` : null}
        href={dayList}
      />
      <StatTile
        label="Sudah hadir"
        value={
          <>
            {work.today.attended} <span className="text-xl text-muted-foreground">/ {work.today.total}</span>
          </>
        }
        note={work.today.noShow > 0 ? `${work.today.noShow} tidak hadir` : null}
        href={dayList}
      />
    </section>
  );
}

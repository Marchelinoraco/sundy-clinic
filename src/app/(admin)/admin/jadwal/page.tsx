import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { HolidayList } from "@/components/admin/holiday-list";
import { ScheduleExceptionForm } from "@/components/admin/schedule-exception-form";
import { ScheduleTemplateForm } from "@/components/admin/schedule-template-form";
import { Button } from "@/components/ui/button";
import { formatIndonesianDate } from "@/lib/format";
import type { ExceptionKind } from "@/lib/slot";
import { minutesToTimeLabel, witaDateString } from "@/lib/time";
import { getBranches } from "@/server/catalog";
import { listHolidays } from "@/server/holiday";
import {
  listSchedulableStaff,
  listScheduleExceptions,
  listScheduleTemplates,
} from "@/server/schedule";
import { requireCapability } from "@/server/session";

const WEEKDAYS = [1, 2, 3, 4, 5, 6]; // Senin–Sabtu — klinik tutup Minggu

const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  LIBUR: "Cuti",
  JAM_TAMBAHAN: "Jam tambahan",
  BLOKIR_SEBAGIAN: "Blokir sebagian",
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ staf?: string }>;
}) {
  await requireCapability("schedule:manage");
  const { staf } = await searchParams;

  const year = new Date().getFullYear();
  const [branches, holidays, staffList] = await Promise.all([
    getBranches(),
    listHolidays(year),
    listSchedulableStaff(),
  ]);

  const primaryBranch = branches.find((b) => b.status === "AKTIF") ?? branches[0];
  const selectedStaff = staffList.find((s) => s.id === staf) ?? staffList[0];

  if (!selectedStaff || !primaryBranch) {
    return (
      <>
        <AdminHeader title="Jadwal" />
        <p className="p-6 text-sm text-muted-foreground">
          Belum ada staf atau cabang aktif untuk dijadwalkan.
        </p>
      </>
    );
  }

  const today = witaDateString(new Date());
  const in90Days = witaDateString(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [templates, exceptions] = await Promise.all([
    listScheduleTemplates(selectedStaff.id),
    listScheduleExceptions(selectedStaff.id, today, in90Days),
  ]);

  return (
    <>
      <AdminHeader title="Jadwal" />
      <div className="space-y-10 p-6">
        {staffList.length > 1 && (
          <nav className="flex flex-wrap gap-2" aria-label="Pilih staf">
            {staffList.map((s) => (
              <Button
                key={s.id}
                asChild
                size="sm"
                variant={s.id === selectedStaff.id ? "default" : "outline"}
              >
                <Link href={`/admin/jadwal?staf=${s.id}`}>{s.name}</Link>
              </Button>
            ))}
          </nav>
        )}

        <section>
          <h2 className="mb-1 text-lg font-medium">Jam Kerja Mingguan — {selectedStaff.name}</h2>
          <p className="mb-3 text-sm text-muted-foreground">Cabang {primaryBranch.name}</p>
          <div className="space-y-2">
            {WEEKDAYS.map((weekday) => (
              <ScheduleTemplateForm
                key={`${selectedStaff.id}-${weekday}`}
                staffId={selectedStaff.id}
                branchId={primaryBranch.id}
                weekday={weekday}
                existing={templates.find((t) => t.weekday === weekday)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Pengecualian Tanggal</h2>
          <ScheduleExceptionForm staffId={selectedStaff.id} />
          {exceptions.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {exceptions.map((e) => (
                <li key={e.id}>
                  {formatIndonesianDate(e.date)} — {EXCEPTION_LABEL[e.kind]}
                  {e.startMinute !== null && e.endMinute !== null
                    ? ` ${minutesToTimeLabel(e.startMinute)}–${minutesToTimeLabel(e.endMinute)}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Kalender Hari Libur {year}</h2>
          <HolidayList holidays={holidays} />
        </section>
      </div>
    </>
  );
}

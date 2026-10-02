import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { HolidayList } from "@/components/admin/holiday-list";
import { PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { PageTabs } from "@/components/admin/page-tabs";
import { ScheduleExceptionForm } from "@/components/admin/schedule-exception-form";
import { ScheduleExceptionList } from "@/components/admin/schedule-exception-list";
import { WeeklyScheduleForm } from "@/components/admin/weekly-schedule-form";
import { formatIndonesianDate } from "@/lib/format";
import { resolveTab } from "@/lib/page-tabs";
import type { ExceptionKind } from "@/lib/slot";
import { minutesToTimeLabel, witaDateString } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getBranches } from "@/server/catalog";
import { listHolidays } from "@/server/holiday";
import { listSchedulableStaff, listScheduleExceptions, listScheduleTemplates } from "@/server/schedule";
import { requireCapability } from "@/server/session";

const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  LIBUR: "Cuti",
  JAM_TAMBAHAN: "Jam tambahan",
  BLOKIR_SEBAGIAN: "Blokir sebagian",
};

const TABS = ["jam-kerja", "pengecualian", "hari-libur"] as const;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ staf?: string; tab?: string | string[] }>;
}) {
  await requireCapability("schedule:manage");
  const params = await searchParams;

  const today = witaDateString(new Date());
  const year = Number(today.slice(0, 4));
  const [branches, holidays, staffList] = await Promise.all([getBranches(), listHolidays(year), listSchedulableStaff()]);

  const primaryBranch = branches.find((b) => b.status === "AKTIF") ?? branches[0];
  const selectedStaff = staffList.find((s) => s.id === params.staf) ?? staffList[0];
  const header = (
    <PageHeader
      title="Jadwal"
      description="Jam praktik tiap tenaga, cuti, dan hari libur klinik. Dipakai untuk slot booking situs dan admin."
      actions={
        staffList.length > 1 && selectedStaff ? (
          <nav aria-label="Pilih tenaga" className="flex flex-wrap gap-1 rounded-lg border p-0.5">
            {staffList.map((s) => (
              <Link
                key={s.id}
                href={`/admin/jadwal?staf=${s.id}${params.tab ? `&tab=${resolveTab(params.tab, TABS)}` : ""}`}
                aria-current={s.id === selectedStaff.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  s.id === selectedStaff.id ? "bg-gold-500 font-semibold text-white" : "text-muted-foreground hover:text-brown-900",
                )}
              >
                {s.name}
              </Link>
            ))}
          </nav>
        ) : undefined
      }
    />
  );

  if (!selectedStaff || !primaryBranch) {
    return (
      <>
        <AdminHeader title="Jadwal" />
        <PageBody>
          {header}
          <p className="text-sm text-muted-foreground">Belum ada staf atau cabang aktif untuk dijadwalkan.</p>
        </PageBody>
      </>
    );
  }

  const in90Days = witaDateString(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [templates, exceptions] = await Promise.all([
    listScheduleTemplates(selectedStaff.id),
    listScheduleExceptions(selectedStaff.id, today, in90Days),
  ]);
  const upcomingHolidays = holidays.filter((h) => h.date.toISOString().slice(0, 10) >= today);
  const pastHolidays = holidays.filter((h) => h.date.toISOString().slice(0, 10) < today);
  const tab = resolveTab(params.tab, TABS);
  const tabHref = (id: (typeof TABS)[number]) => `/admin/jadwal?staf=${selectedStaff.id}&tab=${id}`;

  return (
    <>
      <AdminHeader title="Jadwal" />
      <PageBody>
        {header}
        <PageTabs
          label="Bagian jadwal"
          active={tab}
          tabs={[
            { id: "jam-kerja", label: "Jam kerja", href: tabHref("jam-kerja") },
            { id: "pengecualian", label: `Pengecualian (${exceptions.length})`, href: tabHref("pengecualian") },
            { id: "hari-libur", label: `Hari libur ${year}`, href: tabHref("hari-libur") },
          ]}
        />

        {tab === "jam-kerja" && (
          <WeeklyScheduleForm
            key={`${selectedStaff.id}-${templates.map((t) => `${t.weekday}:${t.startMinute}-${t.endMinute}`).join(",")}`}
            staffId={selectedStaff.id}
            branchId={primaryBranch.id}
            branchName={primaryBranch.name}
            templates={templates.map((t) => ({ weekday: t.weekday, startMinute: t.startMinute, endMinute: t.endMinute }))}
          />
        )}

        {tab === "pengecualian" && (
          <>
            <SectionCard title="Tambah pengecualian" description={`Cuti, jam tambahan, atau blokir sebagian jam untuk ${selectedStaff.name}.`}>
              <ScheduleExceptionForm staffId={selectedStaff.id} />
            </SectionCard>
            <SectionCard title="Pengecualian mulai hari ini" flush>
              <ScheduleExceptionList
                exceptions={exceptions.map((e) => ({
                  id: e.id,
                  dateLabel: formatIndonesianDate(e.date),
                  kindLabel: EXCEPTION_LABEL[e.kind],
                  timeLabel:
                    e.startMinute !== null && e.endMinute !== null
                      ? `${minutesToTimeLabel(e.startMinute)}–${minutesToTimeLabel(e.endMinute)}`
                      : null,
                }))}
              />
            </SectionCard>
          </>
        )}

        {tab === "hari-libur" && (
          <SectionCard title={`Hari libur ${year}`} description="Berlaku untuk semua tenaga dan cabang." flush>
            <HolidayList holidays={upcomingHolidays} emptyText="Tidak ada hari libur lagi tahun ini." />
            {pastHolidays.length > 0 && (
              <details className="border-t">
                <summary className="cursor-pointer px-4 py-3 text-sm text-muted-foreground">Sudah lewat ({pastHolidays.length})</summary>
                <HolidayList holidays={pastHolidays} />
              </details>
            )}
          </SectionCard>
        )}
      </PageBody>
    </>
  );
}

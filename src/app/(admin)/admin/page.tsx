import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { DashboardNumbersCard } from "@/components/admin/dashboard-numbers";
import { DashboardWork } from "@/components/admin/dashboard-work";
import { DoctorWorklistView } from "@/components/admin/doctor-worklist";
import { FailedSection, PageBody, PageHeader } from "@/components/admin/page-layout";
import { ScheduleTimeline } from "@/components/admin/schedule-timeline";
import { Button } from "@/components/ui/button";
import { clinicDayLabel, greetingFor, parsePeriod } from "@/lib/dashboard";
import { formatIndonesianDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { firstName } from "@/lib/quiz-link";
import { settle } from "@/lib/settle";
import { witaDateString, witaMinutesOfDay } from "@/lib/time";
import { getDashboardNumbers, getTodaySchedule, getTodayWork } from "@/server/dashboard";
import { listDoctorWorklist } from "@/server/encounter-read";
import { requireStaff } from "@/server/session";

export const metadata = { title: "Dasbor" };

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string | string[] }>;
}) {
  const staff = await requireStaff();
  const now = new Date();
  const period = parsePeriod((await searchParams).periode);
  const canBook = can(staff.role, "booking:manage");

  // Setiap bagian dimuat sendiri-sendiri dan hanya bila berhak (spec D 4.6–4.7).
  const [work, schedule, worklist, numbers] = await Promise.all([
    canBook ? settle(getTodayWork(now), "pekerjaan hari ini") : null,
    canBook ? settle(getTodaySchedule(now), "jadwal hari ini") : null,
    can(staff.role, "record:read") ? settle(listDoctorWorklist(), "daftar dokter") : null,
    can(staff.role, "report:read") ? settle(getDashboardNumbers(period, now), "angka") : null,
  ]);

  const dayLabel =
    schedule?.ok === true
      ? clinicDayLabel({
          holidayName: schedule.data.holidayName,
          windows: schedule.data.lanes.flatMap((lane) => lane.windows),
        })
      : null;

  return (
    <>
      <AdminHeader title="Dasbor" />
      <PageBody>
        <PageHeader
          title={`${greetingFor(now)}, ${firstName(staff.name)}`}
          description={[formatIndonesianDate(now), dayLabel].filter(Boolean).join(" · ")}
          actions={
            canBook ? (
              <Button asChild>
                <Link href="/admin/booking/baru">+ Booking Baru</Link>
              </Button>
            ) : undefined
          }
        />
        {work && (work.ok ? <DashboardWork work={work.data} today={witaDateString(now)} /> : <FailedSection title="Pekerjaan hari ini" />)}
        {schedule &&
          (schedule.ok ? (
            <ScheduleTimeline schedule={schedule.data} nowMinute={witaMinutesOfDay(now)} />
          ) : (
            <FailedSection title="Jadwal hari ini" />
          ))}
        {(worklist || numbers) && (
          <div className="grid gap-6 xl:grid-cols-2">
            {worklist && (worklist.ok ? <DoctorWorklistView worklist={worklist.data} /> : <FailedSection title="Pasien hari ini" />)}
            {numbers && (numbers.ok ? <DashboardNumbersCard numbers={numbers.data} /> : <FailedSection title="Angka" />)}
          </div>
        )}
      </PageBody>
    </>
  );
}

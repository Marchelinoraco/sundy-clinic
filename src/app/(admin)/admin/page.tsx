import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { DashboardNumbersCard } from "@/components/admin/dashboard-numbers";
import { DashboardWork } from "@/components/admin/dashboard-work";
import { DoctorWorklistView } from "@/components/admin/doctor-worklist";
import { OnlineWorkView } from "@/components/admin/online-work";
import { PayableTiles } from "@/components/admin/stock/payable-tiles";
import { StockAlertTiles } from "@/components/admin/stock/stock-alert-tiles";
import { FailedSection, PageBody, PageHeader } from "@/components/admin/page-layout";
import { ScheduleTimeline } from "@/components/admin/schedule-timeline";
import { Button } from "@/components/ui/button";
import { clinicDayLabel, greetingFor, greetingName, parsePeriod } from "@/lib/dashboard";
import { formatIndonesianDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { settle } from "@/lib/settle";
import { witaDateString, witaMinutesOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getDashboardNumbers, getTodaySchedule, getTodayWork } from "@/server/dashboard";
import { listDoctorWorklist, listOnlineWork } from "@/server/encounter-read";
import { BillingTiles } from "@/components/admin/billing/billing-tiles";
import { countBillable, unpaidOverview } from "@/server/invoice-read";
import { payablesOverview } from "@/server/payable-read";
import { requireStaff } from "@/server/session";
import { countStockAlerts } from "@/server/stock-read";

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
  const [work, schedule, worklist, online, numbers, stock, payables, billable, unpaid] = await Promise.all([
    canBook ? settle(getTodayWork(now), "pekerjaan hari ini") : null,
    canBook ? settle(getTodaySchedule(now), "jadwal hari ini") : null,
    can(staff.role, "record:read") ? settle(listDoctorWorklist(), "daftar dokter") : null,
    can(staff.role, "record:write") ? settle(listOnlineWork(), "konsultasi online") : null,
    can(staff.role, "report:read") ? settle(getDashboardNumbers(period, now), "angka") : null,
    can(staff.role, "stock:read") ? settle(countStockAlerts(), "stok") : null,
    can(staff.role, "payable:manage") ? settle(payablesOverview(), "hutang") : null,
    can(staff.role, "invoice:manage") ? settle(countBillable(), "perlu ditagih") : null,
    can(staff.role, "invoice:correct") ? settle(unpaidOverview(), "tagihan") : null,
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
          title={`${greetingFor(now)}, ${greetingName(staff.name)}`}
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
        {stock && (stock.ok ? <StockAlertTiles alerts={stock.data} /> : <FailedSection title="Stok" />)}
        {payables && (payables.ok ? <PayableTiles overview={payables.data} /> : <FailedSection title="Hutang" />)}
        {(billable || unpaid) &&
          (billable?.ok !== false && unpaid?.ok !== false ? (
            <BillingTiles billable={billable?.ok ? billable.data : null} unpaid={unpaid?.ok ? unpaid.data : null} />
          ) : (
            <FailedSection title="Tagihan" />
          ))}
        {online && (online.ok ? <OnlineWorkView rows={online.data} /> : <FailedSection title="Konsultasi online" />)}
        {(worklist || numbers) && (
          // grid-cols-1 = minmax(0, 1fr): tanpa itu tabel daftar dokter melebarkan halaman di ponsel.
          // Dua kolom hanya bila keduanya tampil; dokter tanpa Angka memakai lebar penuh.
          <div className={cn("grid grid-cols-1 gap-6", worklist && numbers && "xl:grid-cols-2")}>
            {worklist && (worklist.ok ? <DoctorWorklistView worklist={worklist.data} /> : <FailedSection title="Pasien hari ini" />)}
            {numbers && (numbers.ok ? <DashboardNumbersCard numbers={numbers.data} /> : <FailedSection title="Angka" />)}
          </div>
        )}
      </PageBody>
    </>
  );
}

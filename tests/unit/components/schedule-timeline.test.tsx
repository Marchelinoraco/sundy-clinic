import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduleTimeline } from "@/components/admin/schedule-timeline";
import type { TodaySchedule } from "@/server/dashboard";
import { renderAdmin } from "../helpers/render-admin";

const SCHEDULE: TodaySchedule = {
  date: "2031-02-12",
  holidayName: null,
  lanes: [
    {
      staffId: "d1",
      staffName: "dr. Diane",
      windows: [{ startMinute: 660, endMinute: 1140 }],
      bookings: [
        { id: "b1", startMinute: 360, endMinute: 390, time: "06.00", status: "HADIR", patientName: "Maria", serviceName: "Konsultasi" },
        { id: "b2", startMinute: 690, endMinute: 720, time: "11.30", status: "MENUNGGU_KONFIRMASI", patientName: "Budi", serviceName: "Konsultasi" },
      ],
      openSlots: [{ startMinute: 720, endMinute: 750, time: "12.00" }],
    },
  ],
  offStaff: ["Terapis SunDY"],
};

describe("ScheduleTimeline (spec D 4.3)", () => {
  it("lajur per tenaga dengan blok booking bertautan ke daftar Booking", () => {
    renderAdmin(<ScheduleTimeline schedule={SCHEDULE} nowMinute={700} />);
    const card = screen.getByRole("region", { name: "Jadwal hari ini" });
    const lane = within(card).getByRole("listitem", { name: "Jadwal dr. Diane" });
    expect(lane).toHaveTextContent("2 booking · 1 slot kosong");
    // Booking 06.00 di luar jam kerja tetap tampil (Review Focus 1).
    expect(within(lane).getByRole("link", { name: "06.00 Maria · Konsultasi · hadir" })).toHaveAttribute(
      "href",
      "/admin/booking?tanggal=2031-02-12&sorot=b1",
    );
    expect(within(lane).getByRole("link", { name: "11.30 Budi · Konsultasi · menunggu konfirmasi" })).toBeInTheDocument();
    expect(within(card).getByText("Tidak praktik hari ini: Terapis SunDY")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Buka daftar Booking →" })).toHaveAttribute("href", "/admin/booking?tanggal=2031-02-12");
  });

  it("slot kosong membuka Booking Baru dengan tenaga, tanggal, dan jam", () => {
    renderAdmin(<ScheduleTimeline schedule={SCHEDULE} nowMinute={700} />);
    expect(screen.getByRole("link", { name: "Slot kosong 12.00 — buat booking dr. Diane" })).toHaveAttribute(
      "href",
      "/admin/booking/baru?tenaga=d1&tanggal=2031-02-12&jam=12.00",
    );
  });

  it("garis sekarang hanya tampil di dalam rentang jam", () => {
    const { container, rerender } = renderAdmin(<ScheduleTimeline schedule={SCHEDULE} nowMinute={700} />);
    expect(container.querySelector("[data-now]")).not.toBeNull();
    rerender(<ScheduleTimeline schedule={SCHEDULE} nowMinute={1300} />);
    expect(container.querySelector("[data-now]")).toBeNull();
  });

  it("malam hari: tanpa slot kosong, blok booking tetap tampil (Review Focus 3)", () => {
    const evening: TodaySchedule = { ...SCHEDULE, lanes: [{ ...SCHEDULE.lanes[0], openSlots: [] }] };
    renderAdmin(<ScheduleTimeline schedule={evening} nowMinute={1300} />);
    expect(screen.queryByRole("link", { name: /^Slot kosong/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "06.00 Maria · Konsultasi · hadir" })).toBeInTheDocument();
  });

  it("libur atau tanpa jadwal: keterangan", () => {
    const { rerender } = renderAdmin(
      <ScheduleTimeline schedule={{ date: "2031-02-12", holidayName: "Libur Klinik", lanes: [], offStaff: [] }} nowMinute={700} />,
    );
    expect(screen.getByText("Klinik tutup hari ini — Libur Klinik.")).toBeInTheDocument();
    rerender(<ScheduleTimeline schedule={{ date: "2031-02-12", holidayName: null, lanes: [], offStaff: ["dr. Diane"] }} nowMinute={700} />);
    expect(screen.getByText("Tidak ada jadwal praktik hari ini.")).toBeInTheDocument();
  });

  it("hari libur yang masih punya booking: keterangan tutup dan lajur bookingnya", () => {
    const holiday: TodaySchedule = {
      date: "2031-02-12",
      holidayName: "Libur Klinik",
      lanes: [{ ...SCHEDULE.lanes[0], windows: [], openSlots: [] }],
      offStaff: [],
    };
    renderAdmin(<ScheduleTimeline schedule={holiday} nowMinute={700} />);
    expect(screen.getByText("Klinik tutup hari ini — Libur Klinik. Booking yang masih tercatat:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "06.00 Maria · Konsultasi · hadir" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Slot kosong/ })).not.toBeInTheDocument();
  });
});

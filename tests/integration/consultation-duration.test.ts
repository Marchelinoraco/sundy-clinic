// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createAppointment } from "@/server/appointment";
import { resolveBookingPrefill } from "@/server/booking-prefill";
import { getConsultationMinutes } from "@/server/consultation-duration";
import { getTodaySchedule } from "@/server/dashboard";
import { getPublicSlots, holdSlot } from "@/server/public-booking";
import { getStaffAvailabilityForAdmin, getStaffAvailabilityRange } from "@/server/schedule";
import { getClinicConsultationMinutes, updateClinicConsultationDuration } from "@/server/service-admin";
import { requireCapability } from "@/server/session";
import { at, bookableDate, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/request-guard", () => ({
  guardRate: vi.fn().mockResolvedValue(undefined),
  clientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn().mockResolvedValue({
    userId: "u1",
    staffId: "s1",
    name: "Pemilik Uji",
    role: "SUPER_ADMIN",
    email: "uji@sundy.test",
  }),
}));

const SLUG = "durasi-konsultasi-uji";
const WA = "6281200009301";

let world: BookingWorld;
let date: string;
let patientId: string;

// Layanan konsultasi-dokter dipakai bersama berkas uji lain: selalu dikembalikan ke 30 menit.
async function setConsultationMinutes(minutes: number) {
  await prisma.service.update({ where: { slug: "konsultasi-dokter" }, data: { durationMin: minutes } });
}

function consultation(start: string, end: string) {
  return createAppointment({
    patientId,
    branchId: world.branchId,
    staffId: world.doctorId,
    serviceId: world.consultationId,
    type: "KONSULTASI",
    startAt: at(date, start),
    endAt: at(date, end),
    source: "TELEPON",
  });
}

beforeAll(async () => {
  await cleanupBookingWorld(SLUG, [WA]);
  world = await createBookingWorld(SLUG);
  date = await bookableDate(3);
  patientId = (await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-9301", name: "Pasien Durasi", whatsapp: WA } })).id;
});

afterAll(async () => {
  await setConsultationMinutes(30);
  await cleanupBookingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.appointment.deleteMany({ where: { staffId: world.doctorId } });
  await setConsultationMinutes(30);
});

describe("slot konsultasi tiap 15 menit", () => {
  it("konsultasi 15 menit ditawarkan tiap 15 menit sepanjang jam kerja", async () => {
    const slots = await getStaffAvailabilityForAdmin({
      staffId: world.doctorId,
      branchId: world.branchId,
      date,
      durationMinutes: 15,
      kind: "KONSULTASI",
    });
    expect(slots.slice(0, 3).map((s) => s.label)).toEqual(["11.00", "11.15", "11.30"]);
    expect(slots).toHaveLength(32);
  });

  it("treatment, atau tanpa jenis, tetap tiap 30 menit", async () => {
    for (const kind of ["TREATMENT", undefined] as const) {
      const slots = await getStaffAvailabilityForAdmin({ staffId: world.therapistId, branchId: world.branchId, date, durationMinutes: 30, kind });
      expect(slots.slice(0, 2).map((s) => s.label), String(kind)).toEqual(["11.00", "11.30"]);
    }
  });

  it("jenis yang tidak dikenal dari browser dihitung treatment", async () => {
    const slots = await getStaffAvailabilityForAdmin({
      staffId: world.doctorId,
      branchId: world.branchId,
      date,
      durationMinutes: 30,
      kind: "SEMBARANG" as never,
    });
    expect(slots.slice(0, 2).map((s) => s.label)).toEqual(["11.00", "11.30"]);
  });

  it("strip tanggal menghitung jam yang sama dengan pemilih jam", async () => {
    const [day] = await getStaffAvailabilityRange({
      staffId: world.doctorId,
      branchId: world.branchId,
      durationMinutes: 15,
      kind: "KONSULTASI",
      from: date,
      days: 1,
    });
    expect(day).toEqual({ date, state: "OPEN", openCount: 32 });
  });

  it("booking 30 menit yang sudah ada menutup jam :00 dan :15 untuk konsultasi 15 menit", async () => {
    await unwrap(consultation("11:00", "11:30"));
    await setConsultationMinutes(15);
    const slots = await getStaffAvailabilityForAdmin({
      staffId: world.doctorId,
      branchId: world.branchId,
      date,
      durationMinutes: 15,
      kind: "KONSULTASI",
    });
    expect(slots[0].label).toBe("11.30");
  });
});

describe("lama konsultasi dari layanan Konsultasi Dokter", () => {
  it("getConsultationMinutes membaca durasi layanan", async () => {
    expect(await getConsultationMinutes()).toBe(30);
    await setConsultationMinutes(15);
    expect(await getConsultationMinutes()).toBe(15);
  });

  it("dua konsultasi 15 menit berurutan tersimpan tanpa bentrok", async () => {
    await setConsultationMinutes(15);
    const first = await unwrap(consultation("11:00", "11:15"));
    const second = await unwrap(consultation("11:15", "11:30"));
    expect(second.startAt.getTime()).toBe(first.endAt.getTime());
  });

  it("konsultasi yang lamanya tidak sama dengan durasi layanan ditolak", async () => {
    await setConsultationMinutes(15);
    const result = await consultation("11:00", "11:30");
    expect(result).toEqual({ ok: false, error: "Lama konsultasi harus 15 menit. Pilih ulang jamnya." });
    expect(await prisma.appointment.count({ where: { staffId: world.doctorId } })).toBe(0);
  });

  it("treatment tidak diperiksa terhadap durasi konsultasi", async () => {
    await setConsultationMinutes(15);
    const created = await unwrap(
      createAppointment({
        patientId,
        branchId: world.branchId,
        staffId: world.therapistId,
        serviceId: world.treatmentId,
        type: "TREATMENT",
        startAt: at(date, "11:00"),
        endAt: at(date, "12:00"),
        source: "TELEPON",
      }),
    );
    expect(created.type).toBe("TREATMENT");
    await prisma.appointment.delete({ where: { id: created.id } });
  });
});

describe("pengaturan durasi konsultasi di Layanan & Harga", () => {
  it("menyimpan durasi yang sah dan mencatat audit", async () => {
    await unwrap(updateClinicConsultationDuration(15));
    expect(await getClinicConsultationMinutes()).toBe(15);
    expect(requireCapability).toHaveBeenLastCalledWith("content:manage");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "service.consultation.update", entityId: world.consultationId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.summary).toBe("Konsultasi Dokter: 30 menit -> 15 menit");
  });

  it("menolak durasi di luar pilihan, termasuk nilai bukan angka", async () => {
    for (const value of [20, 0, 90, "15", null, Number.NaN]) {
      const result = await updateClinicConsultationDuration(value as never);
      expect(result, String(value)).toEqual({ ok: false, error: "Durasi harus 15, 30, 45, atau 60 menit." });
    }
    expect(await getConsultationMinutes()).toBe(30);
  });

  it("memerlukan hak content:manage", async () => {
    vi.mocked(requireCapability).mockRejectedValueOnce(new Error("Tidak berhak"));
    await expect(updateClinicConsultationDuration(15)).rejects.toThrow("Tidak berhak");
    expect(await getConsultationMinutes()).toBe(30);
  });
});

describe("jalur lain yang menghitung slot konsultasi", () => {
  it("isian awal booking dari dasbor memakai lama konsultasi dan jam :15", async () => {
    await setConsultationMinutes(15);
    const { initial, notice } = await resolveBookingPrefill({ tenaga: world.doctorId, tanggal: date, jam: "11:15" });
    expect(notice).toBeNull();
    expect(initial.slot?.label).toBe("11.15");
    expect(initial.slot!.endAt.getTime() - initial.slot!.startAt.getTime()).toBe(15 * 60_000);
  });

  it("garis waktu dasbor: slot kosong dokter tiap 15 menit sepanjang lama konsultasi, terapis tetap 30 menit", async () => {
    await setConsultationMinutes(15);
    const schedule = await getTodaySchedule(at(date, "08:00"));
    const doctor = schedule.lanes.find((lane) => lane.staffId === world.doctorId)!;
    const therapist = schedule.lanes.find((lane) => lane.staffId === world.therapistId)!;
    expect(doctor.openSlots.slice(0, 2)).toEqual([
      { startMinute: 660, endMinute: 675, time: "11.00" },
      { startMinute: 675, endMinute: 690, time: "11.15" },
    ]);
    expect(therapist.openSlots.slice(0, 2).map((slot) => slot.time)).toEqual(["11.00", "11.30"]);
  });

  it("garis waktu dasbor: blok slot kosong dokter tidak bertumpuk walau konsultasi 30 menit", async () => {
    const schedule = await getTodaySchedule(at(date, "08:00"));
    const doctor = schedule.lanes.find((lane) => lane.staffId === world.doctorId)!;
    expect(doctor.openSlots.slice(0, 2)).toEqual([
      { startMinute: 660, endMinute: 675, time: "11.00" },
      { startMinute: 675, endMinute: 690, time: "11.15" },
    ]);
    for (let i = 1; i < doctor.openSlots.length; i++) {
      expect(doctor.openSlots[i].startMinute).toBeGreaterThanOrEqual(doctor.openSlots[i - 1].endMinute);
    }
  });

  it("situs publik: konsultasi tiap 15 menit dan jam :15 boleh ditahan; treatment tetap tiap 30 menit", async () => {
    await setConsultationMinutes(15);
    const consult = await unwrap(
      getPublicSlots({ serviceId: world.consultationId, staffId: world.doctorId, branchId: world.branchId, date, holdToken: null }),
    );
    expect(consult.slice(0, 2).map((slot) => slot.label)).toEqual(["11.00", "11.15"]);
    const receipt = await unwrap(
      holdSlot({ serviceId: world.consultationId, staffId: world.doctorId, branchId: world.branchId, startAt: at(date, "11:15").toISOString(), previousToken: null }),
    );
    expect(receipt).toBeTruthy();
    await prisma.slotHold.deleteMany({ where: { staffId: world.doctorId } });

    const treatment = await unwrap(
      getPublicSlots({ serviceId: world.treatmentId, staffId: world.therapistId, branchId: world.branchId, date, holdToken: null }),
    );
    expect(treatment.slice(0, 2).map((slot) => slot.label)).toEqual(["11.00", "11.30"]);
  });
});

// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NIK_FORMAT_ERROR } from "@/lib/nik";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { createAppointment } from "@/server/appointment";
import {
  checkInAppointment,
  getCheckInForm,
  lookupNikOwner,
  mergeDuplicatePatient,
  type CheckInInput,
} from "@/server/check-in";
import { getMatchCandidates, matchPatient } from "@/server/intake";
import { countPatients, findPatientsByWhatsapp, listRecentPatients, searchPatients } from "@/server/patient";
import { purgeEncounters } from "../purge-encounters";
import { at, cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as const, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", () => ({ requireCapability: vi.fn().mockResolvedValue(actor) }));

const SLUG = "check-in-uji";
const WA = { main: "6281200006600", owner: "6281200006601", duplicate: "6281200006602", clinical: "6281200006603" };
const OWNER_NIK = "7171015705900001";
const today = witaDateString(new Date());

describe("check-in: NIK, data diri, pasien rangkap", () => {
  let world: BookingWorld;
  let slot = 0;

  async function patient(input: { mrn: string; name: string; whatsapp: string; extra?: object }) {
    return prisma.patient.create({
      data: { medicalRecordNumber: input.mrn, name: input.name, whatsapp: input.whatsapp, ...(input.extra ?? {}) },
    });
  }

  async function booking(patientId: string | null, input: { status?: AppointmentStatus; offsetDays?: number } = {}) {
    slot += 1;
    const minutes = 4 * 60 + slot * 30;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const startAt = at(addDaysToDateString(today, input.offsetDays ?? 0), time);
    return prisma.appointment.create({
      data: {
        code: `CIN-${slot}`,
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: input.status ?? "TERKONFIRMASI",
        source: patientId ? "WHATSAPP" : "SITUS",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId,
      },
    });
  }

  const input = (appointmentId: string, overrides: Partial<CheckInInput> = {}): CheckInInput => ({
    appointmentId,
    nik: { kind: "SET", value: "7171 0102 9203 0001" },
    // Kolom yang sudah terisi di data pasien diabaikan server.
    identity: { birthDate: "1992-04-17", gender: "P", occupation: "Guru", address: "Jl. Uji Check-in 1" },
    whatsapp: "0812-0000-6600",
    offerFoodRecall: true,
    ...overrides,
  });

  beforeAll(async () => {
    await cleanupBookingWorld(SLUG, Object.values(WA));
    world = await createBookingWorld(SLUG);
  });

  beforeEach(async () => {
    // Uji pindah pasien rangkap membuat kunjungan, yang menahan booking (FK Restrict).
    await purgeEncounters(prisma);
    await prisma.foodRecall.deleteMany({ where: { appointment: { staff: { slug: { startsWith: SLUG } } } } });
    await prisma.intake.deleteMany({ where: { appointment: { staff: { slug: { startsWith: SLUG } } } } });
    await prisma.appointment.deleteMany({ where: { staff: { slug: { startsWith: SLUG } } } });
    await prisma.patient.updateMany({ where: { whatsapp: { in: Object.values(WA) } }, data: { mergedIntoId: null } });
    await prisma.patient.deleteMany({ where: { whatsapp: { in: Object.values(WA) } } });
  });

  afterAll(async () => {
    await cleanupBookingWorld(SLUG, Object.values(WA));
    await prisma.$disconnect();
  });

  it("dialog memuat data pasien dan mencentang food recall untuk isian Slimming", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main, extra: { address: "Jl. Lama 1" } });
    const appointment = await booking(main.id);
    await prisma.intake.create({ data: { appointmentId: appointment.id, patientId: main.id, status: "TERISI", kind: "LENGKAP", purpose: "SLIMMING" } });

    const form = await unwrap(getCheckInForm(appointment.id));
    expect(form).toMatchObject({
      code: appointment.code,
      offerFoodRecallByDefault: true,
      patient: { name: "Siti Rahayu", nik: null, nikMissingReason: null, address: "Jl. Lama 1", birthDate: null, gender: null },
    });
    expect(form.summary).toContain("dr. Uji Publik");

    const other = await booking(main.id);
    expect((await unwrap(getCheckInForm(other.id))).offerFoodRecallByDefault).toBe(false);
  });

  it("check-in menyimpan NIK, hanya melengkapi kolom kosong, dan menawarkan food recall", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main, extra: { address: "Jl. Lama 1" } });
    const appointment = await booking(main.id);

    const result = await unwrap(
      checkInAppointment(input(appointment.id, { identity: { gender: "P", occupation: "Guru", address: "Jl. Baru", birthDate: "1992-04-17" } })),
    );
    expect(result.patientName).toBe("Siti Rahayu");
    expect(result.foodRecall).toMatchObject({ state: "OPEN", filled: false });

    const saved = await prisma.patient.findUniqueOrThrow({ where: { id: main.id } });
    expect(saved).toMatchObject({ nik: "7171010292030001", gender: "P", occupation: "Guru", address: "Jl. Lama 1", whatsapp: "6281200006600" });
    expect(saved.birthDate?.toISOString().slice(0, 10)).toBe("1992-04-17");

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { foodRecall: true } });
    expect(row.status).toBe("HADIR");
    expect(row.checkedInAt).not.toBeNull();
    expect(row.foodRecall?.recallDate.toISOString().slice(0, 10)).toBe(addDaysToDateString(today, -1));

    const audits = await prisma.auditLog.findMany({ where: { entityId: { in: [appointment.id, main.id] } } });
    expect(audits.map((a) => a.action).sort()).toEqual(["appointment.check-in", "patient.update-nik"]);
    expect(audits.find((a) => a.action === "patient.update-nik")?.summary).toBe("SDY-2026-6600: ••••••••••••0001");
  });

  it("Belum ada NIK disimpan dengan alasannya, lalu diminta lagi di check-in berikutnya", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main });
    const first = await booking(main.id);
    await unwrap(checkInAppointment(input(first.id, { nik: { kind: "MISSING", reason: "LUPA_KTP" }, offerFoodRecall: false })));
    expect(await prisma.patient.findUniqueOrThrow({ where: { id: main.id } })).toMatchObject({ nik: null, nikMissingReason: "LUPA_KTP" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: first.id }, include: { foodRecall: true } })).foodRecall).toBeNull();

    const second = await booking(main.id, { offsetDays: 1 });
    expect(await checkInAppointment(input(second.id, { nik: { kind: "KEEP" } }))).toEqual({
      ok: false,
      error: "Isi NIK atau pilih alasan belum ada NIK.",
    });
  });

  it("menolak NIK yang bukan 16 angka, alasan asing, dan data diri yang belum diisi", async () => {
    const main = await patient({
      mrn: "SDY-2026-6600",
      name: "Siti Rahayu",
      whatsapp: WA.main,
      extra: { birthDate: new Date("1992-04-17T00:00:00Z"), address: "Jl. Lama 1" },
    });
    const appointment = await booking(main.id);
    expect(await checkInAppointment(input(appointment.id, { nik: { kind: "SET", value: "12345" } }))).toEqual({ ok: false, error: NIK_FORMAT_ERROR });
    expect(
      await checkInAppointment(input(appointment.id, { nik: { kind: "MISSING", reason: "LAINNYA" as never } })),
    ).toEqual({ ok: false, error: "Isi NIK atau pilih alasan belum ada NIK." });
    expect(await checkInAppointment(input(appointment.id, { identity: { occupation: "Guru" } }))).toEqual({
      ok: false,
      error: "Pilih jenis kelamin.",
    });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("TERKONFIRMASI");
  });

  it("NIK milik pasien lain: check-in ditolak, dan pemiliknya ditemukan walau NIK diketik bertitik", async () => {
    const owner = await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const duplicate = await patient({ mrn: "SDY-2026-6602", name: "Siti Rangkap", whatsapp: WA.duplicate });
    const appointment = await booking(duplicate.id);

    expect(await checkInAppointment(input(appointment.id, { nik: { kind: "SET", value: OWNER_NIK } }))).toEqual({
      ok: false,
      error: "NIK ini sudah dipakai Siti Lama (SDY-2026-6601). Periksa lagi, atau pindahkan booking ke pasien itu.",
    });
    const found = await unwrap(lookupNikOwner({ appointmentId: appointment.id, nik: "7171.0157.0590.0001" }));
    expect(found).toMatchObject({ patientId: owner.id, medicalRecordNumber: "SDY-2026-6601", merge: { allowed: true } });
    expect(await unwrap(lookupNikOwner({ appointmentId: appointment.id, nik: "7171015705900099" }))).toBeNull();
  });

  it("pindah pasien rangkap: semua booking dan isian pindah, dan pasien rangkap tersembunyi", async () => {
    const owner = await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const duplicate = await patient({ mrn: "SDY-2026-6602", name: "Siti Rangkap", whatsapp: WA.duplicate });
    const todayBooking = await booking(duplicate.id);
    const laterBooking = await booking(duplicate.id, { offsetDays: 7 });
    await prisma.intake.create({ data: { appointmentId: laterBooking.id, patientId: duplicate.id, status: "TERISI", kind: "PENDEK" } });

    const form = await unwrap(mergeDuplicatePatient({ appointmentId: todayBooking.id, nik: OWNER_NIK }));
    expect(form.patient).toMatchObject({ id: owner.id, nik: OWNER_NIK, name: "Siti Lama" });

    expect(await prisma.appointment.count({ where: { patientId: owner.id } })).toBe(2);
    expect(await prisma.intake.count({ where: { patientId: owner.id } })).toBe(1);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: duplicate.id } })).mergedIntoId).toBe(owner.id);
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.merge-duplicate", entityId: owner.id } })).summary,
    ).toBe("SDY-2026-6602 → SDY-2026-6601: 2 booking, 1 isian");

    await unwrap(checkInAppointment(input(todayBooking.id, { nik: { kind: "KEEP" } })));

    expect((await searchPatients("Siti")).map((p) => p.id)).not.toContain(duplicate.id);
    expect((await listRecentPatients()).map((p) => p.id)).not.toContain(duplicate.id);
    expect(await findPatientsByWhatsapp(WA.duplicate)).toEqual([]);
    // Cari dengan prefiks NIK lengkap 16 angka: NIK fiktif lain berbagi prefiks pendek yang sama,
    // tapi pencarian ini harus tetap unik terhadap pemilik yang sebenarnya.
    expect((await searchPatients(OWNER_NIK)).map((p) => p.id)).toEqual([owner.id]);
    expect(await countPatients()).toBe(await prisma.patient.count({ where: { mergedIntoId: null } }));
  });

  it("pindah pasien rangkap: hasil BIA ikut pindah ke pemilik NIK, supaya riwayat dan grafiknya tidak tertinggal", async () => {
    const owner = await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const duplicate = await patient({ mrn: "SDY-2026-6602", name: "Siti Rangkap", whatsapp: WA.duplicate });
    const todayBooking = await booking(duplicate.id);
    const bia = await prisma.biaMeasurement.create({
      data: { appointmentId: todayBooking.id, patientId: duplicate.id, bodyFatPercent: 30, numbersAt: new Date(), createdById: "s1", createdByName: "Rina" },
    });

    await unwrap(mergeDuplicatePatient({ appointmentId: todayBooking.id, nik: OWNER_NIK }));

    expect((await prisma.biaMeasurement.findUniqueOrThrow({ where: { id: bia.id } })).patientId).toBe(owner.id);
    expect(
      (await prisma.auditLog.findFirstOrThrow({ where: { action: "patient.merge-duplicate", entityId: owner.id } })).summary,
    ).toBe("SDY-2026-6602 → SDY-2026-6601: 1 booking, 0 isian, 1 hasil BIA");
  });

  it("pasien rangkap tidak bisa diberi booking baru", async () => {
    await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const duplicate = await patient({ mrn: "SDY-2026-6602", name: "Siti Rangkap", whatsapp: WA.duplicate });
    const appointment = await booking(duplicate.id);
    await unwrap(mergeDuplicatePatient({ appointmentId: appointment.id, nik: OWNER_NIK }));

    expect(
      await createAppointment({
        patientId: duplicate.id,
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        type: "KONSULTASI",
        startAt: at(addDaysToDateString(today, 2), "09:00"),
        endAt: at(addDaysToDateString(today, 2), "09:30"),
        source: "TELEPON",
      }),
    ).toEqual({
      ok: false,
      error: "Pasien ini rangkap dari Siti Lama (SDY-2026-6601). Buat booking untuk pasien itu.",
    });
  });

  it("pasien rangkap tidak muncul di pencocokan isian dan tidak bisa dipilih", async () => {
    const owner = await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const duplicate = await patient({ mrn: "SDY-2026-6602", name: "Siti Rangkap", whatsapp: WA.duplicate });
    const appointment = await booking(duplicate.id);
    await unwrap(mergeDuplicatePatient({ appointmentId: appointment.id, nik: OWNER_NIK }));

    const site = await booking(null, { status: "MENUNGGU_KONFIRMASI", offsetDays: 3 });
    await prisma.intake.create({
      data: { appointmentId: site.id, status: "TERISI", kind: "PENDEK", name: "Siti", whatsapp: WA.duplicate },
    });
    const candidates = await unwrap(getMatchCandidates(site.id));
    expect(candidates.candidates.map((c) => c.id)).not.toContain(duplicate.id);
    expect(await matchPatient(site.id, duplicate.id)).toEqual({
      ok: false,
      error: "Pasien ini rangkap dari pasien lain. Pilih pasien lamanya.",
    });
    expect(owner.id).toBeTruthy();
  });

  it("pindah ditolak bila pasien booking ini sudah punya catatan dokter atau data klinis", async () => {
    await patient({ mrn: "SDY-2026-6601", name: "Siti Lama", whatsapp: WA.owner, extra: { nik: OWNER_NIK } });
    const clinical = await patient({ mrn: "SDY-2026-6603", name: "Siti Klinis", whatsapp: WA.clinical, extra: { allergies: "Udang" } });
    const appointment = await booking(clinical.id);
    const blocked = "Pasien ini sudah punya catatan dokter. Hubungi Super Admin untuk menggabungkan data.";

    expect(await unwrap(lookupNikOwner({ appointmentId: appointment.id, nik: OWNER_NIK }))).toMatchObject({
      merge: { allowed: false, reason: blocked },
    });
    expect(await mergeDuplicatePatient({ appointmentId: appointment.id, nik: OWNER_NIK })).toEqual({ ok: false, error: blocked });

    await prisma.patient.update({ where: { id: clinical.id }, data: { allergies: null } });
    const past = await booking(clinical.id, { status: "HADIR", offsetDays: -7 });
    await prisma.encounter.create({ data: { appointmentId: past.id, createdById: world.doctorId, createdByName: "dr. Uji" } });
    expect(await mergeDuplicatePatient({ appointmentId: appointment.id, nik: OWNER_NIK })).toEqual({ ok: false, error: blocked });
  });

  it("dua resepsionis meng-check-in bersamaan: hanya satu yang berhasil", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main });
    const appointment = await booking(main.id);
    const [first, second] = await Promise.all([
      checkInAppointment(input(appointment.id)),
      checkInAppointment(input(appointment.id)),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const failed = first.ok ? second : first;
    expect(failed).toEqual({ ok: false, error: "Booking ini sudah check-in." });
    expect(await prisma.auditLog.count({ where: { action: "appointment.check-in", entityId: appointment.id } })).toBe(1);
  });

  it("booking batal atau belum dicocokkan tidak bisa di-check-in", async () => {
    const main = await patient({ mrn: "SDY-2026-6600", name: "Siti Rahayu", whatsapp: WA.main });
    const cancelled = await booking(main.id, { status: "DIBATALKAN" });
    expect(await getCheckInForm(cancelled.id)).toEqual({ ok: false, error: expect.stringMatching(/dibatalkan/i) });
    expect(await checkInAppointment(input(cancelled.id))).toEqual({ ok: false, error: expect.stringMatching(/dibatalkan/i) });

    const unmatched = await booking(null, { status: "MENUNGGU_KONFIRMASI" });
    expect(await checkInAppointment(input(unmatched.id))).toEqual({
      ok: false,
      error: "Cocokkan booking ini dengan data pasien lebih dulu.",
    });
  });
});

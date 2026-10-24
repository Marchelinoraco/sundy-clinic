// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { countReminderWork, getReminderWorklist } from "@/server/reminder";
import { recordTreatmentReminder } from "@/server/treatment-reminder";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

vi.mock("@/server/session", () => ({
  requireCapability: vi.fn(async () => ({ userId: "u", staffId: "s-ingat", name: "Mey", role: "RESEPSIONIS", email: "u@uji.test" })),
}));
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

// Kotak 5 "Waktunya treatment lagi" (spec pengingat treatment PT4–PT9, PT12–PT14).
const SLUG = "ingat-treatment";
const WA_BASE = 6281200095000;
const today = witaDateString(new Date());
const ago = (days: number) => addDaysToDateString(today, -days);
const day = (value: string) => new Date(`${value}T00:00:00Z`);
let world: BillingWorld;
let facialId: string;
let peelingId: string;
let hifuId: string;
let seq = 0;
const whatsapps: string[] = [];

async function patient(name: string, whatsapp?: string) {
  seq += 1;
  const wa = whatsapp ?? String(WA_BASE + seq);
  whatsapps.push(wa);
  return (await prisma.patient.create({ data: { medicalRecordNumber: `SDY-IT-${seq}-${Date.now() % 100000}`, name, whatsapp: wa } })).id;
}

type Line = { serviceId: string | null; name: string; kind?: "LAYANAN" | "TREATMENT"; patientPackageItemId?: string };

/** Kunjungan `on` pukul `time` WITA dengan tagihan berisi `lines`; tanpa booking bila `direct`. */
async function visit(patientId: string, on: string, lines: Line[], opts: { time?: string; status?: "FINAL" | "DIBATALKAN"; direct?: boolean } = {}) {
  seq += 1;
  const [h, m] = (opts.time ?? "10:00").split(":").map(Number);
  const startAt = combineWitaDateAndMinutes(on, h * 60 + m);
  const appointment = opts.direct
    ? null
    : await prisma.appointment.create({
        data: {
          code: `IT-${seq}-${Date.now() % 100000}`, type: "TREATMENT", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status: "SELESAI", source: "WALK_IN",
          branchId: world.branchId, staffId: world.doctorId, serviceId: world.treatmentId, patientId,
        },
      });
  const status = opts.status ?? "FINAL";
  return prisma.invoice.create({
    data: {
      patientId, branchId: world.branchId, appointmentId: appointment?.id ?? null, status, number: `TG-IT-${seq}-${Date.now() % 100000}`,
      finalizedAt: startAt, cancelledAt: status === "DIBATALKAN" ? new Date() : null, createdById: "s", createdByName: "Uji",
      lines: {
        create: lines.map((line, index) => ({
          kind: line.kind ?? "TREATMENT", name: line.name, quantity: 1, unitPrice: line.patientPackageItemId ? 0 : 100_000, serviceId: line.serviceId,
          patientPackageItemId: line.patientPackageItemId ?? null, sortOrder: index,
        })),
      },
    },
  });
}

const booking = async (patientId: string, on: string, status: "TERKONFIRMASI" | "SELESAI") => {
  seq += 1;
  const startAt = combineWitaDateAndMinutes(on, 9 * 60);
  return prisma.appointment.create({
    data: {
      code: `IT-B${seq}-${Date.now() % 100000}`, type: "KONSULTASI", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status, source: "WHATSAPP",
      branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId,
    },
  });
};

/** Paket pasien dengan satu isi Facial; `nextVisitOn` null = sesinya sudah habis. */
async function patientPackage(patientId: string, nextVisitOn: string | null) {
  const catalog = await prisma.treatmentPackage.create({ data: { name: `${SLUG} Paket ${seq}`, price: 500_000, validDays: 60 } });
  const purchase = await visit(patientId, ago(30), [{ serviceId: null, name: "Paket Facial" }], { direct: true });
  const line = await prisma.invoiceLine.create({ data: { invoiceId: purchase.id, kind: "PAKET", name: "Paket Facial", quantity: 1, unitPrice: 500_000, treatmentPackageId: catalog.id, sortOrder: 9 } });
  const pkg = await prisma.patientPackage.create({
    data: {
      patientId, packageId: catalog.id, name: "Paket Facial", price: 500_000, purchaseLineId: line.id, startsOn: day(ago(30)), expiresOn: day(addDaysToDateString(today, 30)),
      nextVisitOn: nextVisitOn ? day(nextVisitOn) : null, items: { create: [{ serviceId: facialId, serviceName: "Facial Ingat", sessions: 4 }] },
    },
    include: { items: true },
  });
  return pkg.items[0].id;
}

const rowOf = async (patientId: string) => (await getReminderWorklist()).treatmentReturns.find((row) => row.patientId === patientId);

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, []);
  await prisma.service.deleteMany({ where: { slug: { in: [`${SLUG}-peeling`, `${SLUG}-hifu`] } } });
  world = await createBillingWorld(SLUG, String(WA_BASE));
  facialId = world.treatmentId;
  await prisma.service.update({ where: { id: facialId }, data: { name: "Facial Ingat", returnReminderDays: 7 } });
  const categoryId = (await prisma.service.findUniqueOrThrow({ where: { id: facialId } })).categoryId;
  peelingId = (await prisma.service.create({ data: { slug: `${SLUG}-peeling`, name: "Peeling Ingat", promoPrice: 100_000, categoryId, returnReminderDays: 14 } })).id;
  hifuId = (await prisma.service.create({ data: { slug: `${SLUG}-hifu`, name: "HIFU Ingat", promoPrice: 100_000, categoryId, returnReminderDays: 7 } })).id;
});
afterAll(async () => {
  const patientIds = (await prisma.patient.findMany({ where: { whatsapp: { in: whatsapps } }, select: { id: true } })).map((row) => row.id);
  await prisma.packageSessionEntry.deleteMany({ where: { item: { patientPackage: { patientId: { in: patientIds } } } } });
  await prisma.invoiceLine.updateMany({ where: { invoice: { patientId: { in: patientIds } } }, data: { patientPackageItemId: null } });
  await prisma.patientPackage.deleteMany({ where: { patientId: { in: patientIds } } });
  await prisma.patient.updateMany({ where: { id: { in: patientIds } }, data: { mergedIntoId: null } });
  await cleanupBillingWorld(SLUG, whatsapps);
  await prisma.treatmentPackage.deleteMany({ where: { name: { startsWith: `${SLUG} Paket` } } });
  await prisma.invoiceLine.deleteMany({ where: { serviceId: { in: [peelingId, hifuId] } } });
  await prisma.service.deleteMany({ where: { id: { in: [peelingId, hifuId] } } });
  await prisma.$disconnect();
});

describe("kotak 5: waktunya treatment lagi", () => {
  it("muncul pada tanggal treatment + jarak, selama 7 hari, lalu hilang; belum waktunya tidak tampil (PT6)", async () => {
    const due = await patient("Rina Wulandari");
    const late = await patient("Ani Terlambat");
    const gone = await patient("Budi Lewat");
    const early = await patient("Cici Belum");
    await visit(due, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await visit(late, ago(13), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await visit(gone, ago(14), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await visit(early, ago(6), [{ serviceId: facialId, name: "Facial Ingat" }]);

    expect(await rowOf(due)).toMatchObject({ patientName: "Rina Wulandari", treatments: "Facial Ingat", treatmentOn: ago(7), intervalDays: 7, dueOn: today, overdue: false, sent: null });
    expect(await rowOf(late)).toMatchObject({ dueOn: ago(6), overdue: true });
    expect(await rowOf(gone)).toBeUndefined();
    expect(await rowOf(early)).toBeUndefined();
  });

  it("layanan yang dibooking (baris Layanan) dihitung; layanan Tidak diingatkan, baris bebas, dan tagihan batal tidak (PT4)", async () => {
    const booked = await patient("Dewi Booking");
    const consult = await patient("Eka Konsultasi");
    const free = await patient("Fani Bebas");
    const cancelled = await patient("Gita Batal");
    await visit(booked, ago(7), [{ serviceId: facialId, name: "Facial Ingat", kind: "LAYANAN" }]);
    await visit(consult, ago(7), [{ serviceId: world.consultationId, name: "Konsultasi Dokter", kind: "LAYANAN" }]);
    await visit(free, ago(7), [{ serviceId: null, name: "Treatment bebas" }]);
    await visit(cancelled, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }], { status: "DIBATALKAN" });

    expect(await rowOf(booked)).toMatchObject({ treatments: "Facial Ingat" });
    expect(await rowOf(consult)).toBeUndefined();
    expect(await rowOf(free)).toBeUndefined();
    expect(await rowOf(cancelled)).toBeUndefined();
  });

  it("dua treatment satu kunjungan: satu baris, jarak terpendek, pesan menyebut keduanya (PT7)", async () => {
    const both = await patient("Hana Dua");
    await visit(both, ago(7), [
      { serviceId: peelingId, name: "Peeling Ingat" },
      { serviceId: facialId, name: "Facial Ingat" },
    ]);
    const row = await rowOf(both);
    expect(row).toMatchObject({ treatments: "Peeling Ingat dan Facial Ingat", intervalDays: 7 });
    expect(row!.message.text).toContain("melakukan Peeling Ingat dan Facial Ingat di SunDY Clinic");
    expect(row!.message.text).toContain("sebaiknya dilakukan setiap minggu");
    expect(row!.message.link).toMatch(/^https:\/\/wa\.me\/628/);
  });

  it("treatment lebih baru menggantikan yang lama; penjualan langsung memakai tanggal tagihan (PT5, PT7)", async () => {
    const repeat = await patient("Indah Ulang");
    await visit(repeat, ago(20), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await visit(repeat, ago(7), [{ serviceId: hifuId, name: "HIFU Ingat" }], { direct: true });
    expect(await rowOf(repeat)).toMatchObject({ treatments: "HIFU Ingat", treatmentOn: ago(7) });
  });

  it("tidak masuk bila punya booking berikutnya, sudah datang lagi (termasuk hanya konsultasi), punya paket aktif berjadwal, atau pasien rangkap; sesi dari paket yang sudah selesai tetap dihitung (PT9, Review Focus 1)", async () => {
    const upcoming = await patient("Joko Booking");
    const cameBack = await patient("Kiki Kembali");
    const packaged = await patient("Lala Paket");
    const merged = await patient("Mira Rangkap");
    const finished = await patient("Nina Paket Selesai");
    for (const id of [upcoming, cameBack, packaged, merged]) await visit(id, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await booking(upcoming, addDaysToDateString(today, 1), "TERKONFIRMASI");
    await booking(cameBack, ago(2), "SELESAI");
    await patientPackage(packaged, addDaysToDateString(today, 3));
    await prisma.patient.update({ where: { id: merged }, data: { mergedIntoId: upcoming } });
    const sessionItem = await patientPackage(finished, null);
    await visit(finished, ago(7), [{ serviceId: facialId, name: "Facial Ingat", patientPackageItemId: sessionItem }]);

    expect(await rowOf(upcoming)).toBeUndefined();
    expect(await rowOf(cameBack)).toBeUndefined();
    expect(await rowOf(packaged)).toBeUndefined();
    expect(await rowOf(merged)).toBeUndefined();
    expect(await rowOf(finished)).toMatchObject({ treatments: "Facial Ingat" });
  });

  it("jarak diubah sesudah treatment: jatuh tempo mengikuti pengaturan baru; Tidak diingatkan menghapus barisnya (Review Focus 2)", async () => {
    const changed = await patient("Oki Ubah");
    await visit(changed, ago(7), [{ serviceId: hifuId, name: "HIFU Ingat" }]);
    expect(await rowOf(changed)).toMatchObject({ intervalDays: 7 });
    await prisma.service.update({ where: { id: hifuId }, data: { returnReminderDays: 14 } });
    expect(await rowOf(changed)).toBeUndefined();
    await prisma.service.update({ where: { id: hifuId }, data: { returnReminderDays: null } });
    expect(await rowOf(changed)).toBeUndefined();
    await prisma.service.update({ where: { id: hifuId }, data: { returnReminderDays: 7 } });
  });

  it("Kirim tercatat sekali per tekan; baris menjadi Sudah diingatkan; angka menu berkurang (PT12, PT13, Review Focus 3)", async () => {
    const sendTo = await patient("Putri Kirim");
    await visit(sendTo, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }]);
    const before = await countReminderWork();
    await unwrap(recordTreatmentReminder({ patientId: sendTo, treatmentOn: ago(7) }));
    expect(await rowOf(sendTo)).toMatchObject({ sent: { sentByName: "Mey" } });
    expect(await countReminderWork()).toBe(before - 1);
    await unwrap(recordTreatmentReminder({ patientId: sendTo, treatmentOn: ago(7) }));
    expect(await prisma.treatmentReminder.count({ where: { patientId: sendTo } })).toBe(2);
    expect((await getReminderWorklist()).treatmentReturns.filter((row) => row.patientId === sendTo)).toHaveLength(1);
    expect(await recordTreatmentReminder({ patientId: sendTo, treatmentOn: "kemarin" })).toEqual({ ok: false, error: "Tanggal treatment tidak sah." });
    expect(await recordTreatmentReminder({ patientId: "tidak-ada", treatmentOn: ago(7) })).toEqual({ ok: false, error: "Pasien tidak ditemukan." });
  });

  it("kunjungan 00.30 WITA memakai tanggal WITA, bukan tanggal UTC (Review Focus 4)", async () => {
    const early = await patient("Rara Subuh");
    await visit(early, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }], { time: "00:30" });
    expect(await rowOf(early)).toMatchObject({ treatmentOn: ago(7), dueOn: today });
  });

  it("nomor WA tidak sah: baris tanpa tautan (PT14, Review Focus 5)", async () => {
    const noWa = await patient("Sinta Tanpa WA", "12");
    await visit(noWa, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }]);
    expect((await rowOf(noWa))!.message.link).toBeNull();
  });
});

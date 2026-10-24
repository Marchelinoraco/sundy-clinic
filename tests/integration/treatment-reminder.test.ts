// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { countReminderWork, getReminderWorklist } from "@/server/reminder";
import { recordTreatmentReminder } from "@/server/treatment-reminder";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { treatmentWorld } from "./treatment-world";
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
let world: BillingWorld;
let facialId: string;
let peelingId: string;
let hifuId: string;
let tw: ReturnType<typeof treatmentWorld>;

const rowOf = async (patientId: string) => (await getReminderWorklist()).treatmentReturns.find((row) => row.patientId === patientId);

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, []);
  await prisma.service.deleteMany({ where: { slug: { in: [`${SLUG}-peeling`, `${SLUG}-hifu`] } } });
  world = await createBillingWorld(SLUG, String(WA_BASE));
  tw = treatmentWorld(world, { prefix: SLUG, waBase: WA_BASE });
  facialId = world.treatmentId;
  await prisma.service.update({ where: { id: facialId }, data: { name: "Facial Ingat", returnReminderDays: 7 } });
  const categoryId = (await prisma.service.findUniqueOrThrow({ where: { id: facialId } })).categoryId;
  peelingId = (await prisma.service.create({ data: { slug: `${SLUG}-peeling`, name: "Peeling Ingat", promoPrice: 100_000, categoryId, returnReminderDays: 14 } })).id;
  hifuId = (await prisma.service.create({ data: { slug: `${SLUG}-hifu`, name: "HIFU Ingat", promoPrice: 100_000, categoryId, returnReminderDays: 7 } })).id;
});
afterAll(async () => {
  await tw.cleanupBefore();
  await cleanupBillingWorld(SLUG, tw.whatsapps);
  await tw.cleanupAfter();
  await prisma.invoiceLine.deleteMany({ where: { serviceId: { in: [peelingId, hifuId] } } });
  await prisma.service.deleteMany({ where: { id: { in: [peelingId, hifuId] } } });
  await prisma.$disconnect();
});

describe("kotak 5: waktunya treatment lagi", () => {
  it("muncul pada tanggal treatment + jarak, selama 7 hari, lalu hilang; belum waktunya tidak tampil (PT6)", async () => {
    const due = await tw.patient("Rina Wulandari");
    const late = await tw.patient("Ani Terlambat");
    const gone = await tw.patient("Budi Lewat");
    const early = await tw.patient("Cici Belum");
    await tw.visit(due, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await tw.visit(late, ago(13), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await tw.visit(gone, ago(14), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await tw.visit(early, ago(6), [{ serviceId: facialId, name: "Facial Ingat" }]);

    expect(await rowOf(due)).toMatchObject({ patientName: "Rina Wulandari", treatments: "Facial Ingat", treatmentOn: ago(7), intervalDays: 7, dueOn: today, overdue: false, sent: null });
    expect(await rowOf(late)).toMatchObject({ dueOn: ago(6), overdue: true });
    expect(await rowOf(gone)).toBeUndefined();
    expect(await rowOf(early)).toBeUndefined();
  });

  it("layanan yang dibooking (baris Layanan) dihitung; layanan Tidak diingatkan, baris bebas, dan tagihan batal tidak (PT4)", async () => {
    const booked = await tw.patient("Dewi Booking");
    const consult = await tw.patient("Eka Konsultasi");
    const free = await tw.patient("Fani Bebas");
    const cancelled = await tw.patient("Gita Batal");
    await tw.visit(booked, ago(7), [{ serviceId: facialId, name: "Facial Ingat", kind: "LAYANAN" }]);
    await tw.visit(consult, ago(7), [{ serviceId: world.consultationId, name: "Konsultasi Dokter", kind: "LAYANAN" }]);
    await tw.visit(free, ago(7), [{ serviceId: null, name: "Treatment bebas" }]);
    await tw.visit(cancelled, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }], { status: "DIBATALKAN" });

    expect(await rowOf(booked)).toMatchObject({ treatments: "Facial Ingat" });
    expect(await rowOf(consult)).toBeUndefined();
    expect(await rowOf(free)).toBeUndefined();
    expect(await rowOf(cancelled)).toBeUndefined();
  });

  it("dua treatment satu kunjungan: satu baris, jarak terpendek, pesan menyebut keduanya (PT7)", async () => {
    const both = await tw.patient("Hana Dua");
    await tw.visit(both, ago(7), [
      { serviceId: peelingId, name: "Peeling Ingat" },
      { serviceId: facialId, name: "Facial Ingat" },
    ]);
    const row = await rowOf(both);
    expect(row).toMatchObject({ treatments: "Peeling Ingat dan Facial Ingat", intervalDays: 7 });
    expect(row!.message.text).toContain("melakukan Peeling Ingat dan Facial Ingat di SunDY Clinic");
    // Jarak berbeda: anjuran "setiap minggu" hanya untuk Facial, bukan Peeling yang 2 minggu (temuan review).
    expect(row!.message.text).toContain("Agar hasilnya maksimal, Facial Ingat sebaiknya dilakukan setiap minggu.");
    expect(row!.message.link).toMatch(/^https:\/\/wa\.me\/628/);
  });

  it("treatment lebih baru menggantikan yang lama; penjualan langsung memakai tanggal tagihan (PT5, PT7)", async () => {
    const repeat = await tw.patient("Indah Ulang");
    await tw.visit(repeat, ago(20), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await tw.visit(repeat, ago(7), [{ serviceId: hifuId, name: "HIFU Ingat" }], { direct: true });
    expect(await rowOf(repeat)).toMatchObject({ treatments: "HIFU Ingat", treatmentOn: ago(7) });
  });

  it("tidak masuk bila punya booking berikutnya, sudah datang lagi (termasuk hanya konsultasi), punya paket aktif berjadwal, atau pasien rangkap; sesi dari paket yang sudah selesai tetap dihitung (PT9, Review Focus 1)", async () => {
    const upcoming = await tw.patient("Joko Booking");
    const cameBack = await tw.patient("Kiki Kembali");
    const packaged = await tw.patient("Lala Paket");
    const merged = await tw.patient("Mira Rangkap");
    const finished = await tw.patient("Nina Paket Selesai");
    for (const id of [upcoming, cameBack, packaged, merged]) await tw.visit(id, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }]);
    await tw.booking(upcoming, addDaysToDateString(today, 1), "TERKONFIRMASI");
    await tw.booking(cameBack, ago(2), "SELESAI");
    await tw.patientPackage(packaged, facialId, addDaysToDateString(today, 3));
    await prisma.patient.update({ where: { id: merged }, data: { mergedIntoId: upcoming } });
    const sessionItem = await tw.patientPackage(finished, facialId, null);
    await tw.visit(finished, ago(7), [{ serviceId: facialId, name: "Facial Ingat", patientPackageItemId: sessionItem }]);

    expect(await rowOf(upcoming)).toBeUndefined();
    expect(await rowOf(cameBack)).toBeUndefined();
    expect(await rowOf(packaged)).toBeUndefined();
    expect(await rowOf(merged)).toBeUndefined();
    expect(await rowOf(finished)).toMatchObject({ treatments: "Facial Ingat" });
  });

  it("jarak diubah sesudah treatment: jatuh tempo mengikuti pengaturan baru; Tidak diingatkan menghapus barisnya (Review Focus 2)", async () => {
    const changed = await tw.patient("Oki Ubah");
    await tw.visit(changed, ago(7), [{ serviceId: hifuId, name: "HIFU Ingat" }]);
    expect(await rowOf(changed)).toMatchObject({ intervalDays: 7 });
    await prisma.service.update({ where: { id: hifuId }, data: { returnReminderDays: 14 } });
    expect(await rowOf(changed)).toBeUndefined();
    await prisma.service.update({ where: { id: hifuId }, data: { returnReminderDays: null } });
    expect(await rowOf(changed)).toBeUndefined();
    await prisma.service.update({ where: { id: hifuId }, data: { returnReminderDays: 7 } });
  });

  it("Kirim tercatat sekali per tekan; baris menjadi Sudah diingatkan; angka menu berkurang (PT12, PT13, Review Focus 3)", async () => {
    const sendTo = await tw.patient("Putri Kirim");
    await tw.visit(sendTo, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }]);
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
    const early = await tw.patient("Rara Subuh");
    await tw.visit(early, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }], { time: "00:30" });
    expect(await rowOf(early)).toMatchObject({ treatmentOn: ago(7), dueOn: today });
  });

  it("nomor WA tidak sah: baris tanpa tautan (PT14, Review Focus 5)", async () => {
    const noWa = await tw.patient("Sinta Tanpa WA", "12");
    await tw.visit(noWa, ago(7), [{ serviceId: facialId, name: "Facial Ingat" }]);
    expect((await rowOf(noWa))!.message.link).toBeNull();
  });
});

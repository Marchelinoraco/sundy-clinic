// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dateLabel } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { listTreatmentPatients } from "@/server/treatment-patients-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { treatmentWorld } from "./treatment-world";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Mey", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

// Tab "Pasien treatment" (spec pengingat treatment PT10, PT12, PT14).
const SLUG = "pasien-treatment";
const WA_BASE = 6281200096000;
const today = witaDateString(new Date());
const ago = (days: number) => addDaysToDateString(today, -days);
let world: BillingWorld;
let tw: ReturnType<typeof treatmentWorld>;
let facialId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, []);
  world = await createBillingWorld(SLUG, String(WA_BASE));
  tw = treatmentWorld(world, { prefix: SLUG, waBase: WA_BASE });
  facialId = world.treatmentId;
  await prisma.service.update({ where: { id: facialId }, data: { name: "Facial Tabzz", returnReminderDays: 7 } });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await tw.cleanupBefore();
  await cleanupBillingWorld(SLUG, tw.whatsapps);
  await tw.cleanupAfter();
  await prisma.$disconnect();
});

describe("tab Pasien treatment", () => {
  it("semua pasien yang pernah treatment, terbaru dulu; cari nama atau treatment; saringan lebih dari n minggu; 50 per halaman (PT10)", async () => {
    const recent = await tw.patient("Tabzz Ani");
    const middle = await tw.patient("Tabzz Budi");
    const old = await tw.patient("Tabzz Cici");
    const consultOnly = await tw.patient("Tabzz Konsul");
    await tw.visit(recent, ago(3), [{ serviceId: facialId, name: "Facial Tabzz" }]);
    await tw.visit(middle, ago(20), [{ serviceId: facialId, name: "Facial Tabzz" }]);
    await tw.visit(old, ago(40), [{ serviceId: facialId, name: "Facial Tabzz" }]);
    await tw.visit(consultOnly, ago(5), [{ serviceId: world.consultationId, name: "Konsultasi Dokter", kind: "LAYANAN" }]);

    const all = await listTreatmentPatients({ q: "tabzz" });
    expect(all.rows.map((row) => row.patientName)).toEqual(["Tabzz Ani", "Tabzz Budi", "Tabzz Cici"]);
    expect(all.rows[0]).toMatchObject({ treatments: "Facial Tabzz", treatmentOn: ago(3), intervalDays: 7, lastReminder: null, markers: [] });
    expect(all.rows[0].message.text).toContain("melakukan Facial Tabzz di SunDY Clinic");
    expect((await listTreatmentPatients({ q: "BUDI tabzz" })).rows).toHaveLength(0);
    expect((await listTreatmentPatients({ q: "Tabzz Budi" })).rows.map((row) => row.patientId)).toEqual([middle]);
    expect((await listTreatmentPatients({ q: "tabzz", olderThanWeeks: 2 })).rows.map((row) => row.patientId)).toEqual([middle, old]);
    expect((await listTreatmentPatients({ q: "tabzz", olderThanWeeks: 4 })).rows.map((row) => row.patientId)).toEqual([old]);

    for (let i = 0; i < 49; i += 1) {
      const id = await tw.patient(`Tabzz Banyak ${String(i).padStart(2, "0")}`);
      await tw.visit(id, ago(10), [{ serviceId: facialId, name: "Facial Tabzz" }], { direct: true });
    }
    const first = await listTreatmentPatients({ q: "tabzz" });
    expect(first).toMatchObject({ total: 52, page: 1, pageSize: 50 });
    expect(first.rows).toHaveLength(50);
    const second = await listTreatmentPatients({ q: "tabzz", page: 2 });
    expect(second.rows.map((row) => row.patientName)).toEqual(["Tabzz Budi", "Tabzz Cici"]);
    expect((await listTreatmentPatients({ q: "tabzz", page: 9 })).page).toBe(2);
  });

  it("tanda booking, paket aktif, dan sudah datang lagi; tetap bisa dikirimi; terakhir diingatkan dari catatan (PT10, PT12, PT14)", async () => {
    const booked = await tw.patient("Tandazz Booking");
    const packaged = await tw.patient("Tandazz Paket");
    const back = await tw.patient("Tandazz Kembali");
    const noWa = await tw.patient("Tandazz Tanpa WA", "12");
    for (const id of [booked, packaged, back, noWa]) await tw.visit(id, ago(14), [{ serviceId: facialId, name: "Facial Tabzz" }]);
    const bookingOn = addDaysToDateString(today, 2);
    await tw.booking(booked, bookingOn, "TERKONFIRMASI");
    const visitOn = addDaysToDateString(today, 5);
    await tw.patientPackage(packaged, facialId, visitOn);
    await tw.booking(back, ago(3), "SELESAI");
    await prisma.treatmentReminder.create({ data: { patientId: back, treatmentOn: new Date(`${ago(14)}T00:00:00Z`), staffId: "s", staffName: "Rina" } });

    const rows = (await listTreatmentPatients({ q: "tandazz" })).rows;
    const byId = new Map(rows.map((row) => [row.patientId, row]));
    expect(byId.get(booked)!.markers).toEqual([`punya booking ${dateLabel(bookingOn)}`]);
    expect(byId.get(packaged)!.markers).toEqual([`paket aktif · kunjungan berikutnya ${dateLabel(visitOn)}`]);
    expect(byId.get(back)).toMatchObject({ markers: [`sudah datang lagi ${dateLabel(ago(3))}`], lastReminder: { staffName: "Rina" } });
    expect(byId.get(booked)!.message.link).toMatch(/^https:\/\/wa\.me\//);
    expect(byId.get(noWa)!.message.link).toBeNull();
  });

  it("Resepsionis boleh, Admin Keuangan tidak (booking:manage)", async () => {
    actor.role = "ADMIN_KEUANGAN";
    await expect(listTreatmentPatients({})).rejects.toThrow(/forbidden: booking:manage/);
  });
});

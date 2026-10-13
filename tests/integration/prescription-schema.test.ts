// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

const SLUG = "skema-resep";
const WA = "6281200009730";
let world: BillingWorld;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("skema resep dokter", () => {
  it("resep kunjungan final terkunci", async () => {
    const { encounterId } = await finalVisit(world);
    await expect(
      prisma.encounterPrescription.create({ data: { encounterId, itemId: world.drugId, itemName: "Obat", quantity: 1, usage: "3 x 1" } }),
    ).rejects.toThrow(/rekam_medis_terkunci/);
  });

  it("nilai resep dan penagihan masuk akal", async () => {
    const appointment = await prisma.appointment.create({
      data: {
        code: "SKR-1",
        type: "KONSULTASI",
        channel: "KLINIK",
        startAt: new Date("2031-06-01T02:00:00Z"),
        endAt: new Date("2031-06-01T02:30:00Z"),
        status: "HADIR",
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: world.patientId,
      },
    });
    const encounter = await prisma.encounter.create({ data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji" } });
    const base = { encounterId: encounter.id, itemId: world.drugId, itemName: "Obat" };
    await expect(prisma.encounterPrescription.create({ data: { ...base, quantity: 0, usage: "3 x 1" } })).rejects.toThrow(/encounter_prescription_values/);
    await expect(prisma.encounterPrescription.create({ data: { ...base, quantity: 1, usage: "  " } })).rejects.toThrow(/encounter_prescription_values/);
    const prescription = await prisma.encounterPrescription.create({ data: { ...base, quantity: 10, usage: "3 x 1" } });

    const { lineIds } = await seedDispensing(world, appointment.id, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 10 }] });
    const set = (data: Record<string, unknown>) => prisma.dispensingLine.update({ where: { id: lineIds[0] }, data });
    await expect(set({ billedQuantity: 10, billingNote: "Stok kurang" })).rejects.toThrow(/dispensing_line_billing/);
    await expect(set({ billedQuantity: 5 })).rejects.toThrow(/dispensing_line_billing/);
    await expect(set({ billedQuantity: -1, billingNote: "x" })).rejects.toThrow(/dispensing_line_billing/);
    expect((await set({ billedQuantity: 0, billingNote: "Customer menolak", prescriptionId: prescription.id })).billedQuantity).toBe(0);
    expect((await prisma.dispensing.findFirstOrThrow({ where: { appointmentId: appointment.id } })).source).toBe("APOTEKER");
  });
});

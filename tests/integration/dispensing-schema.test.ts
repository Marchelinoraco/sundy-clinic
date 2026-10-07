// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

const SLUG = "skema-penyerahan";
const WA = "6281200008900";

describe("skema penyerahan obat", () => {
  let world: BillingWorld;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });

  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("penyerahan baru berstatus Menunggu, versi 1; satu per kunjungan", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await seedDispensing(world, appointmentId);
    expect(await prisma.dispensing.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "MENUNGGU", version: 1, completedAt: null });
    await expect(seedDispensing(world, appointmentId)).rejects.toThrow(/Unique constraint/);
  });

  it("status dan data penyelesai harus sejalan", async () => {
    const { appointmentId } = await finalVisit(world);
    const base = { appointmentId, branchId: world.branchId };
    await expect(prisma.dispensing.create({ data: { ...base, status: "SELESAI" } })).rejects.toThrow(/dispensing_status_fields/);
    await expect(prisma.dispensing.create({ data: { ...base, completedAt: new Date(), completedById: "s1", completedByName: "x" } })).rejects.toThrow(
      /dispensing_status_fields/,
    );
    expect((await seedDispensing(world, appointmentId, { status: "TANPA_OBAT" })).id).toBeTruthy();
  });

  it("baris: jumlah positif dan aturan pakai tidak kosong", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await seedDispensing(world, appointmentId);
    const line = (data: Record<string, unknown>) =>
      prisma.dispensingLine.create({ data: { dispensingId: id, itemId: world.drugId, itemName: "Obat", quantity: 1, usage: "2 x 1", ...data } });
    await expect(line({ quantity: 0 })).rejects.toThrow(/dispensing_line_values/);
    await expect(line({ usage: "   " })).rejects.toThrow(/dispensing_line_values/);
    expect((await line({})).quantity).toBe(1);
  });

  it("satu baris penyerahan hanya bisa masuk satu baris tagihan", async () => {
    const { appointmentId } = await finalVisit(world);
    const { lineIds } = await seedDispensing(world, appointmentId, { lines: [{ itemId: world.drugId, quantity: 2 }] });
    const invoice = (await prisma.invoice.create({
      data: { patientId: world.patientId, branchId: world.branchId, createdById: "s1", createdByName: "Uji" },
    })).id;
    const row = { invoiceId: invoice, kind: "BARANG" as const, itemId: world.drugId, name: "Obat", quantity: 2, unitPrice: 2000, dispensingLineId: lineIds[0] };
    await prisma.invoiceLine.create({ data: row });
    await expect(prisma.invoiceLine.create({ data: row })).rejects.toThrow(/Unique constraint/);
  });

  it("Catatan untuk Apoteker paling banyak 1.000 karakter di basis data", async () => {
    // Kunjungan final terkunci (trigger encounter_locked), jadi uji memakai kunjungan draf.
    const startAt = new Date(Date.UTC(2032, 0, 1, 1, 0));
    const appointment = await prisma.appointment.create({
      data: {
        code: "SKP-1",
        type: "KONSULTASI",
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: "HADIR",
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: world.patientId,
      },
    });
    const encounter = await prisma.encounter.create({
      data: { appointmentId: appointment.id, createdById: world.doctorId, createdByName: "dr. Uji" },
    });
    await expect(prisma.encounter.update({ where: { id: encounter.id }, data: { pharmacyNote: "x".repeat(1001) } })).rejects.toThrow(
      /encounter_pharmacy_note_length/,
    );
    expect((await prisma.encounter.update({ where: { id: encounter.id }, data: { pharmacyNote: "x".repeat(1000) } })).pharmacyNote).toHaveLength(1000);
  });
});

// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { emptyDraftInput, type EncounterDraftInput } from "@/lib/encounter";
import { finalizeEncounter, openEncounter, saveEncounterDraft } from "@/server/encounter";
import { getEncounterForStaff } from "@/server/encounter-read";
import { listPrescribableItems } from "@/server/prescription-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "dr. Resep", role: "DOKTER" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "resep-kunjungan";
const WA = "6281200009731";
let world: BillingWorld;
let seq = 0;
const draft = (prescriptions: EncounterDraftInput["prescriptions"], patch: Partial<EncounterDraftInput> = {}): EncounterDraftInput => ({
  ...emptyDraftInput(),
  assessment: "Infeksi",
  ...patch,
  prescriptions,
});

async function openVisit() {
  seq += 1;
  const startAt = new Date(Date.UTC(2032, 0, 1, 1, 0) + seq * 3_600_000);
  const appointment = await prisma.appointment.create({
    data: {
      code: `RSK-${seq}`, type: "KONSULTASI", channel: "KLINIK", startAt, endAt: new Date(startAt.getTime() + 1_800_000), status: "HADIR",
      source: "WALK_IN", branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId: world.patientId,
    },
  });
  const { encounterId } = await unwrap(openEncounter(appointment.id));
  const version = (await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).updatedAt.toISOString();
  return { appointmentId: appointment.id, encounterId, version };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, { invoiceNumber: `${SLUG}-F1`, itemId: world.drugId, quantity: 4 });
  actor.staffId = world.doctorId;
});
beforeEach(() => {
  actor.role = "DOKTER";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("resep di catatan kunjungan (spec resep dokter 3–4)", () => {
  it("simpan draf menulis ulang resep dengan nama obat yang disalin", async () => {
    const { encounterId, version } = await openVisit();
    const saved = await unwrap(saveEncounterDraft({ encounterId, version, draft: draft([{ itemId: world.drugId, quantity: "10", usage: "3 x 1" }]) }));
    await unwrap(saveEncounterDraft({ encounterId, version: saved.version, draft: draft([{ itemId: world.productId, quantity: "1", usage: "Oles malam" }]) }));
    const rows = await prisma.encounterPrescription.findMany({ where: { encounterId } });
    expect(rows).toEqual([expect.objectContaining({ itemId: world.productId, itemName: `${SLUG} Serum C`, quantity: 1, usage: "Oles malam", sortOrder: 0 })]);
  });

  it("obat nonaktif atau tanpa harga jual ditolak dengan namanya (Review Focus 3)", async () => {
    const { encounterId, version } = await openVisit();
    const off = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-OFF`, name: `${SLUG} Obat Mati`, kind: "OBAT", unit: "tablet", sellPrice: null } });
    expect(await saveEncounterDraft({ encounterId, version, draft: draft([{ itemId: off.id, quantity: "1", usage: "1 x 1" }]) })).toEqual({
      ok: false,
      error: `Obat ${SLUG} Obat Mati sudah nonaktif atau belum punya harga jual. Hapus dari resep.`,
    });
    await prisma.stockItem.delete({ where: { id: off.id } });
  });

  it("finalisasi membuat penyerahan dari dokter berstatus Selesai dengan baris yang sama, dan resep terkunci", async () => {
    const { appointmentId, encounterId, version } = await openVisit();
    await unwrap(
      finalizeEncounter({
        encounterId,
        version,
        draft: draft([
          { itemId: world.drugId, quantity: "10", usage: "3 x 1 sesudah makan" },
          { itemId: world.productId, quantity: "1", usage: "Oles malam" },
        ]),
      }),
    );
    const dispensing = await prisma.dispensing.findUniqueOrThrow({ where: { appointmentId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    expect(dispensing).toMatchObject({ source: "DOKTER", status: "SELESAI", completedById: world.doctorId, completedByName: "dr. Resep", branchId: world.branchId });
    expect(dispensing.lines.map((l) => [l.itemId, l.quantity, l.usage])).toEqual([
      [world.drugId, 10, "3 x 1 sesudah makan"],
      [world.productId, 1, "Oles malam"],
    ]);
    expect(dispensing.lines.every((l) => l.prescriptionId !== null)).toBe(true);
    await expect(prisma.encounterPrescription.deleteMany({ where: { encounterId } })).rejects.toThrow(/rekam_medis_terkunci/);
  });

  it("finalisasi tanpa resep tidak membuat penyerahan", async () => {
    const { appointmentId, encounterId, version } = await openVisit();
    await unwrap(finalizeEncounter({ encounterId, version, draft: draft([]) }));
    expect(await prisma.dispensing.count({ where: { appointmentId } })).toBe(0);
  });

  it("pilihan obat dokter: aktif dan berharga jual, dengan sisa stok, tanpa harga (Review Focus 5)", async () => {
    const options = await listPrescribableItems(world.branchId, []);
    const drug = options.find((o) => o.id === world.drugId)!;
    expect(drug).toEqual({ id: world.drugId, code: `${SLUG.toUpperCase()}-OBT`, name: `${SLUG} Amoxicillin`, unit: "kapsul", available: 4 });
    expect(Object.keys(drug)).not.toContain("sellPrice");
    const { encounterId } = await openVisit();
    const detail = (await getEncounterForStaff(encounterId))!;
    expect(detail.options.medicines.some((m) => m.id === world.drugId)).toBe(true);
    expect(JSON.stringify(detail.options.medicines)).not.toMatch(/sellPrice|unitCost/);
  });
});

// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { emptyDraftInput, type EncounterDraftInput } from "@/lib/encounter";
import { finalizeEncounter, openEncounter, saveEncounterDraft } from "@/server/encounter";
import { getEncounterForStaff } from "@/server/encounter-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { nurseDone } from "./nurse-release";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "dr. Paket", role: "DOKTER" as const, email: "u@uji.test" } }));
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

const SLUG = "paket-resep";
const WA = "6281200009988";
let world: BillingWorld;
let glow: string;
let old: string;
let seq = 0;
const draft = (packages: EncounterDraftInput["packages"]): EncounterDraftInput => ({ ...emptyDraftInput(), assessment: "Obesitas", packages });

async function openVisit() {
  seq += 1;
  const startAt = new Date(Date.UTC(2032, 0, 1, 1, 0) + seq * 3_600_000);
  const appointment = await nurseDone(
    prisma.appointment.create({
      data: {
        code: `PRS-${seq}`, type: "KONSULTASI", channel: "KLINIK", startAt, endAt: new Date(startAt.getTime() + 1_800_000), status: "HADIR",
        source: "WALK_IN", branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId: world.patientId,
      },
    }),
  );
  const { encounterId } = await unwrap(openEncounter(appointment.id));
  const version = (await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } })).updatedAt.toISOString();
  return { encounterId, version };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  actor.staffId = world.doctorId;
  glow = (
    await prisma.treatmentPackage.create({
      data: { name: `${SLUG} Glow`, price: 1_500_000, validDays: 90, items: { create: [{ serviceId: world.treatmentId, sessions: 4, sortOrder: 0 }, { itemId: world.drugId, sessions: 28, perVisit: 7, sortOrder: 1 }] } },
    })
  ).id;
  old = (await prisma.treatmentPackage.create({ data: { name: `${SLUG} Lama`, price: 900_000, validDays: 30, isActive: false, items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }] } } })).id;
});
beforeEach(() => {
  actor.role = "DOKTER";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("paket di resep dokter (spec vital perawat PR1, PR4)", () => {
  it("menyimpan nama dan isi paket dari katalog; pilihan tanpa paket nonaktif; tampil di catatan", async () => {
    const { encounterId, version } = await openVisit();
    const options = (await getEncounterForStaff(encounterId))!.options.packages;
    expect(options).toContainEqual({ id: glow, name: `${SLUG} Glow`, contents: `4× Facial Uji, 28 kapsul ${SLUG} Amoxicillin` });
    expect(options.map((option) => option.id)).not.toContain(old);

    await unwrap(saveEncounterDraft({ encounterId, version, draft: draft([{ packageId: glow }]) }));
    expect(await prisma.encounterPackage.findMany({ where: { encounterId } })).toEqual([
      expect.objectContaining({ packageId: glow, packageName: `${SLUG} Glow`, contents: `4× Facial Uji, 28 kapsul ${SLUG} Amoxicillin`, sortOrder: 0 }),
    ]);
    const detail = (await getEncounterForStaff(encounterId))!;
    expect(detail.draft.packages).toEqual([{ packageId: glow }]);
    expect(detail.packages).toEqual([{ id: expect.any(String), name: `${SLUG} Glow`, contents: `4× Facial Uji, 28 kapsul ${SLUG} Amoxicillin`, declined: null }]);
  });

  it("paket nonaktif yang sudah ada di draf tetap jadi pilihan; terkunci saat final", async () => {
    const { encounterId, version } = await openVisit();
    await prisma.encounterPackage.create({ data: { encounterId, packageId: old, packageName: `${SLUG} Lama`, contents: "2× Facial Uji", sortOrder: 0 } });
    const detail = (await getEncounterForStaff(encounterId))!;
    expect(detail.options.packages.map((option) => option.id)).toContain(old);
    await unwrap(finalizeEncounter({ encounterId, version: detail.version, draft: { ...detail.draft, assessment: "Kontrol" } }));
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "EncounterPackage" WHERE "encounterId" = $1`, encounterId)).rejects.toThrow(/rekam_medis_terkunci/);
    void version;
  });
});

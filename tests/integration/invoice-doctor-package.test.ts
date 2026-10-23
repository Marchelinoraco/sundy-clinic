// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getEncounterForStaff } from "@/server/encounter-read";
import { applyPackageSession, createInvoiceFromVisit, declineDoctorPackage, removeInvoiceLine, restoreDoctorPackage } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";
import { testApproval } from "./approver";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Rina Kasir", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "paket-dokter";
const WA = "6281200009999";
let world: BillingWorld;
let glow: { id: string; name: string };
let slim: { id: string; name: string };
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

async function visitWithPackages() {
  const { appointmentId, encounterId } = await finalVisit(world, {
    packages: [
      { packageId: glow.id, packageName: glow.name, contents: "4× Facial Uji" },
      { packageId: slim.id, packageName: slim.name, contents: "2× Facial Uji" },
    ],
  });
  const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
  return { appointmentId, encounterId, invoiceId: id };
}
const doctorLine = (invoiceId: string, name: string) => prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, kind: "PAKET", name } });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  glow = await prisma.treatmentPackage.create({ data: { name: `${SLUG} Glow`, price: 1_500_000, validDays: 90, items: { create: [{ serviceId: world.treatmentId, sessions: 4, sortOrder: 0 }] } }, select: { id: true, name: true } });
  slim = await prisma.treatmentPackage.create({ data: { name: `${SLUG} Slim`, price: 800_000, validDays: 60, items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }] } }, select: { id: true, name: true } });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("paket dari dokter di tagihan (spec vital perawat PR2, PR3)", () => {
  it("masuk sebagai baris paket berharga katalog; tidak bisa dihapus biasa; tidak dibeli harus beralasan; bisa dikembalikan", async () => {
    const { encounterId, invoiceId } = await visitWithPackages();
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId, kind: "PAKET" }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((line) => [line.name, line.unitPrice, line.quantity, line.treatmentPackageId])).toEqual([
      [glow.name, 1_500_000, 1, glow.id],
      [slim.name, 800_000, 1, slim.id],
    ]);
    expect(lines.every((line) => line.encounterPackageId !== null)).toBe(true);
    expect((await getInvoiceDetail(invoiceId))!.lines.filter((line) => line.fromDoctorPackage)).toHaveLength(2);

    const slimLine = await doctorLine(invoiceId, slim.name);
    expect(await removeInvoiceLine({ invoiceId, version: await versionOf(invoiceId), lineId: slimLine.id })).toEqual({
      ok: false,
      error: "Paket dari dokter dihapus lewat tombol Tidak dibeli dengan alasan.",
    });
    expect(await declineDoctorPackage({ invoiceId, version: await versionOf(invoiceId), lineId: slimLine.id, reason: "x" })).toEqual({ ok: false, error: "Alasan 2–200 karakter." });

    await unwrap(declineDoctorPackage({ invoiceId, version: await versionOf(invoiceId), lineId: slimLine.id, reason: "Pasien pikir-pikir dulu" }));
    expect(await prisma.invoiceLine.count({ where: { invoiceId, name: slim.name } })).toBe(0);
    const declined = (await getInvoiceDetail(invoiceId))!.declinedPackages;
    expect(declined).toEqual([{ encounterPackageId: slimLine.encounterPackageId, name: slim.name, reason: "Pasien pikir-pikir dulu" }]);
    actor.role = "SUPER_ADMIN";
    expect((await getEncounterForStaff(encounterId))!.packages.find((p) => p.name === slim.name)!.declined).toBe("Tidak dibeli — Pasien pikir-pikir dulu");
    actor.role = "RESEPSIONIS";

    await unwrap(restoreDoctorPackage({ invoiceId, version: await versionOf(invoiceId), encounterPackageId: slimLine.encounterPackageId! }));
    expect(await prisma.invoiceLine.count({ where: { invoiceId, name: slim.name, encounterPackageId: slimLine.encounterPackageId } })).toBe(1);
    expect((await getInvoiceDetail(invoiceId))!.declinedPackages).toEqual([]);
    actor.role = "SUPER_ADMIN";
    expect((await getEncounterForStaff(encounterId))!.packages.find((p) => p.name === slim.name)!.declined).toBeNull();
  });

  it("paket yang sesinya sudah dipakai di tagihan ini tidak bisa langsung ditolak (Review Focus 4)", async () => {
    const { invoiceId } = await visitWithPackages();
    const glowLine = await doctorLine(invoiceId, glow.name);
    const treatment = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, kind: "TREATMENT" } });
    await unwrap(applyPackageSession({ invoiceId, version: await versionOf(invoiceId), lineId: treatment.id, purchaseLineId: glowLine.id }));
    expect(await declineDoctorPackage({ invoiceId, version: await versionOf(invoiceId), lineId: glowLine.id, reason: "Tidak jadi" })).toEqual({
      ok: false,
      error: "Lepas dulu sesi atau barang yang memakai paket ini.",
    });
  });

  it("tagihan dibatalkan lalu dibuat ulang: yang ditolak tetap di luar dengan alasannya, yang diterima kembali (Review Focus 5)", async () => {
    const { appointmentId, invoiceId } = await visitWithPackages();
    const slimLine = await doctorLine(invoiceId, slim.name);
    await unwrap(declineDoctorPackage({ invoiceId, version: await versionOf(invoiceId), lineId: slimLine.id, reason: "Mahal" }));
    await unwrap(finalizeInvoice({ invoiceId, version: await versionOf(invoiceId) }));
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId, reason: "Salah input" }));
    actor.role = "RESEPSIONIS";

    const { id: again } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect((await prisma.invoiceLine.findMany({ where: { invoiceId: again, kind: "PAKET" } })).map((line) => line.name)).toEqual([glow.name]);
    expect((await getInvoiceDetail(again))!.declinedPackages).toEqual([{ encounterPackageId: slimLine.encounterPackageId, name: slim.name, reason: "Mahal" }]);
  });
});

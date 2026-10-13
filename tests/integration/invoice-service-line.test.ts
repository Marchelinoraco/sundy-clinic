// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addServiceLine, createDirectSale, setLinePerformer } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Katalog", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baris-katalog";
const WA = "6281200009711";
let world: BillingWorld;
let addonId: string;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const facial = await prisma.service.findUniqueOrThrow({ where: { id: world.treatmentId } });
  addonId = (
    await prisma.service.create({
      data: { slug: `${SLUG}-addon`, name: "Add-on Katalog Uji", promoPrice: 60_000, categoryId: facial.categoryId, materialCost: 10_000, toolCost: 5_000, commissionKind: "NOMINAL", commissionValue: 8_000 },
    })
  ).id;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("baris treatment dari katalog internal (spec layanan situs 6)", () => {
  it("membuat baris TREATMENT tertaut berharga katalog; biaya dan komisi tersalin saat final", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: addonId, quantity: 2 }));
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, serviceId: addonId } });
    expect(line).toMatchObject({ kind: "TREATMENT", name: "Add-on Katalog Uji", quantity: 2, unitPrice: 60_000 });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, summary: "Tambah baris Add-on Katalog Uji ×2" } })).action).toBe("invoice.update");

    await unwrap(setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: line.id, performerId: world.therapistId }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ materialCost: 20_000, commissionAmount: 16_000 });
  });

  it("menolak layanan nonaktif, Konsultasi Online, atau yang tidak ada; Admin Keuangan tidak menagih", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await prisma.service.update({ where: { id: addonId }, data: { isActive: false } });
    expect(await addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: addonId, quantity: 1 })).toEqual({ ok: false, error: "Layanan tidak tersedia." });
    await prisma.service.update({ where: { id: addonId }, data: { isActive: true } });
    expect(await addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: "tidak-ada", quantity: 1 })).toEqual({ ok: false, error: "Layanan tidak tersedia." });
    const online = await prisma.service.findUnique({ where: { slug: "konsultasi-online" } });
    if (online) expect(await addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: online.id, quantity: 1 })).toEqual({ ok: false, error: "Layanan tidak tersedia." });
    expect(await addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: addonId, quantity: 0 })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat lebih dari 0." });

    actor.role = "ADMIN_KEUANGAN";
    await expect(addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: addonId, quantity: 1 })).rejects.toThrow("forbidden: invoice:manage");
  });
});

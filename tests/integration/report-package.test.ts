// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getProfitReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Laporan", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "laporan-paket";
const WA = "6281200009609";
let world: BillingWorld;
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("laporan paket", () => {
  it("pendapatan paket dihitung sekali; sesi terpakai tanpa tagihan pemakaian yang dibatalkan (Review Focus 5)", async () => {
    const packageId = await catalogPackage(world, { name: "Facial 3x", price: 600_000 });
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
    const itemId = (await prisma.patientPackageItem.findFirstOrThrow({ where: { patientPackage: { purchaseLine: { invoiceId: id } } } })).id;

    const used: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const { appointmentId } = await finalVisit(world);
      const visit = await unwrap(createInvoiceFromVisit(appointmentId));
      const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: visit.id, kind: "TREATMENT" } });
      await unwrap(applyPackageSession({ invoiceId: visit.id, version: await versionOf(visit.id), lineId: line.id, patientPackageItemId: itemId }));
      await unwrap(finalizeInvoice({ invoiceId: visit.id, version: await versionOf(visit.id) }));
      used.push(visit.id);
    }
    await unwrap(cancelInvoice({ invoiceId: used[1], reason: "Salah input" }));

    const report = await getProfitReport({ period: monthPeriod(witaDateString(new Date()).slice(0, 7)), branchId: world.branchId });
    expect(report.current.totals.package).toBe(600_000);
    expect(report.current.totals.treatment).toBe(0);
    expect(report.packageSessions).toEqual([{ name: "Facial Uji", unit: null, sessions: 1 }]);
  });
});

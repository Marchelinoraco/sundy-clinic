// @vitest-environment node
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { monthPeriod } from "@/lib/report";
import { witaDateString } from "@/lib/time";
import { exportCommissionCsv } from "@/server/report-export";
import { getCommissionReport } from "@/server/report-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Komisi", role: "ADMIN_KEUANGAN" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "laporan-komisi";
const WA = "6281200009710";
let world: BillingWorld;
let seq = 0;
const period = () => monthPeriod(witaDateString(new Date()).slice(0, 7));

async function invoice(lines: Prisma.InvoiceLineUncheckedCreateWithoutInvoiceInput[], status: "FINAL" | "DIBATALKAN" = "FINAL") {
  return prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      status,
      number: `TG-2097-${String(++seq).padStart(4, "0")}`,
      finalizedAt: new Date(),
      lines: { create: lines },
    },
  });
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  const rina = { performerId: world.therapistId, performerName: "Rina" };
  const doc = { performerId: world.doctorId, performerName: "dr. Uji" };
  await invoice([
    { kind: "TREATMENT", name: "Facial Uji", quantity: 2, unitPrice: 250_000, serviceId: world.treatmentId, commissionAmount: 50_000, ...rina },
    { kind: "TREATMENT", name: "Meso Uji", quantity: 1, unitPrice: 550_000, serviceId: world.slimmingTreatmentId, commissionAmount: 30_000, ...doc },
  ]);
  await invoice([{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, commissionAmount: 25_000, ...rina }]);
  await invoice([{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, commissionAmount: 25_000, ...rina }], "DIBATALKAN");
  await invoice([{ kind: "TREATMENT", name: "Tanpa pelaksana", quantity: 1, unitPrice: 1000 }]);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("laporan komisi pelaksana", () => {
  it("per pelaksana: jumlah treatment dan total komisi; tagihan dibatalkan dan baris tanpa pelaksana tidak dihitung", async () => {
    const { rows, details } = await getCommissionReport({ period: period(), branchId: world.branchId, performerId: null });
    expect(rows).toEqual([
      { performerId: world.therapistId, performerName: "Rina", treatments: 3, commission: 75_000 },
      { performerId: world.doctorId, performerName: "dr. Uji", treatments: 1, commission: 30_000 },
    ]);
    expect(details).toBeNull();
  });

  it("rincian satu pelaksana dan CSV semua rincian", async () => {
    const { details } = await getCommissionReport({ period: period(), branchId: world.branchId, performerId: world.therapistId });
    expect(details!.map((d) => [d.treatment, d.quantity, d.commission])).toEqual(
      expect.arrayContaining([
        ["Facial Uji", 2, 50_000],
        ["Facial Uji", 1, 25_000],
      ]),
    );
    expect(details).toHaveLength(2);
    const { filename, csv } = await exportCommissionCsv({ period: period(), branchId: world.branchId });
    expect(filename).toMatch(/^komisi-pelaksana-/);
    expect(csv).toContain("Pelaksana,Tanggal,Tagihan,Customer,Treatment,Jumlah,Komisi (Rp)");
    expect(csv).toContain("dr. Uji");
  });
});

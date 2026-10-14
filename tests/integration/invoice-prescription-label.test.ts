// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoiceFromVisit } from "@/server/invoice-drafts";
import { getInvoicePrescriptionLabel } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "APOTEKER" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Etiket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
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

const SLUG = "etiket-tagihan";
const WA = "6281200009734";
let world: BillingWorld;
let invoiceId: string;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, { invoiceNumber: `${SLUG}-F1`, itemId: world.drugId, quantity: 20 });
  const { appointmentId } = await finalVisit(world, { pharmacyNote: "RAHASIA-KLINIS" });
  const { id } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 6, usage: "2 x 1 sesudah makan" }] });
  await prisma.dispensing.update({ where: { id }, data: { source: "DOKTER" } });
  invoiceId = (await unwrap(createInvoiceFromVisit(appointmentId))).id;
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("etiket dari tagihan (spec resep dokter 5)", () => {
  it("memuat pasien, dokter, obat, jumlah ditagih, aturan pakai; tanpa harga dan data klinis (Review Focus 5)", async () => {
    const label = (await getInvoicePrescriptionLabel(invoiceId))!;
    expect(label).toMatchObject({ patientName: `Pasien ${SLUG}`, lines: [{ name: `${SLUG} Amoxicillin`, quantity: 6, usage: "2 x 1 sesudah makan" }] });
    // Dokter yang memfinalkan catatan, bukan staf booking (booking dunia uji atas nama "dr. Uji Publik").
    expect(label.doctorName).toBe("dr. Uji");
    expect(JSON.stringify(label)).not.toMatch(/RAHASIA-KLINIS|unitPrice|sellPrice|2000/);
  });

  it("Admin Keuangan boleh; Apoteker tidak", async () => {
    actor.role = "ADMIN_KEUANGAN";
    expect(await getInvoicePrescriptionLabel(invoiceId)).not.toBeNull();
    actor.role = "APOTEKER";
    await expect(getInvoicePrescriptionLabel(invoiceId)).rejects.toThrow("forbidden: invoice:read");
  });
});

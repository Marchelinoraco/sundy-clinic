// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addFreeLine, addPackageLine, addServiceLine, applyPackageSession, createDirectSale, createInvoiceFromVisit, setLinePerformer } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail, listPerformers } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Pelaksana", role: "RESEPSIONIS" as const, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "pelaksana";
const WA = "6281200009705";
let world: BillingWorld;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("pelaksana treatment", () => {
  it("disalin dari catatan kunjungan; bisa diganti dan dikosongkan; baris layanan ditolak", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const detail = (await getInvoiceDetail(id))!;
    const treatment = detail.lines.find((line) => line.kind === "TREATMENT")!;
    expect(treatment).toMatchObject({ performerId: world.therapistId, performerName: "Terapis Uji" });

    await unwrap(setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, performerId: world.doctorId }));
    const doctor = await prisma.staff.findUniqueOrThrow({ where: { id: world.doctorId } });
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: treatment.id } })).toMatchObject({ performerId: world.doctorId, performerName: doctor.name });
    await unwrap(setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, performerId: null }));
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: treatment.id } })).performerId).toBeNull();

    const layanan = detail.lines.find((line) => line.kind === "LAYANAN")!;
    expect(await setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: layanan.id, performerId: world.therapistId })).toEqual({
      ok: false,
      error: "Pelaksana hanya untuk baris treatment.",
    });
    expect(await setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: treatment.id, performerId: "bukan-staf" })).toEqual({
      ok: false,
      error: "Pelaksana tidak ditemukan atau nonaktif.",
    });
  });

  it("kunjungan yang treatment-nya tanpa pelaksana menghasilkan baris tanpa pelaksana (spec aturan pakai PL2, Review Focus 5)", async () => {
    const { appointmentId } = await finalVisit(world, { performer: null });
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const treatment = (await getInvoiceDetail(id))!.lines.find((line) => line.kind === "TREATMENT")!;
    expect(treatment).toMatchObject({ performerId: null, performerName: null });
  });

  it("baris treatment bebas boleh tanpa pelaksana; daftar pelaksana hanya dokter dan terapis aktif", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    await unwrap(addFreeLine({ invoiceId: id, version: await versionOf(id), kind: "TREATMENT", name: "Treatment bebas", quantity: 1, unitPrice: 100_000 }));
    expect((await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, name: "Treatment bebas" } })).performerId).toBeNull();
    const performers = await listPerformers();
    expect(performers.map((p) => p.id)).toEqual(expect.arrayContaining([world.doctorId, world.therapistId]));
  });
});

describe("finalisasi butuh pelaksana di setiap treatment (spec aturan pakai PL3)", () => {
  const directSale = async () => (await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }))).id;
  const finalize = async (id: string) => finalizeInvoice({ invoiceId: id, version: await versionOf(id) });
  const treatmentLine = (invoiceId: string) => prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, kind: "TREATMENT" } });

  it("treatment tanpa pelaksana menolak finalisasi; layanan tidak butuh pelaksana", async () => {
    const id = await directSale();
    await unwrap(addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: world.treatmentId, quantity: 1 }));
    await unwrap(addFreeLine({ invoiceId: id, version: await versionOf(id), kind: "LAYANAN", name: "Konsultasi bebas", quantity: 1, unitPrice: 50_000 }));
    expect(await finalize(id)).toEqual({ ok: false, error: "Pilih pelaksana untuk Facial Uji." });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe("DRAF");

    await unwrap(setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: (await treatmentLine(id)).id, performerId: world.therapistId }));
    await unwrap(finalize(id));
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe("FINAL");
  });

  it("sesi paket Rp 0 juga butuh pelaksana; setelah dipilih, komisinya tercatat (Review Focus 4)", async () => {
    await prisma.service.update({ where: { id: world.treatmentId }, data: { commissionKind: "NOMINAL", commissionValue: 10_000 } });
    const pkg = await prisma.treatmentPackage.create({
      data: { name: `${SLUG} Paket`, price: 500_000, validDays: 30, items: { create: [{ serviceId: world.treatmentId, sessions: 2, sortOrder: 0 }] } },
    });
    const id = await directSale();
    await unwrap(addPackageLine({ invoiceId: id, version: await versionOf(id), packageId: pkg.id }));
    await unwrap(addServiceLine({ invoiceId: id, version: await versionOf(id), serviceId: world.treatmentId, quantity: 1 }));
    const purchaseLine = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "PAKET" } });
    await unwrap(applyPackageSession({ invoiceId: id, version: await versionOf(id), lineId: (await treatmentLine(id)).id, purchaseLineId: purchaseLine.id }));
    expect(await finalize(id)).toEqual({ ok: false, error: "Pilih pelaksana untuk Facial Uji." });

    await unwrap(setLinePerformer({ invoiceId: id, version: await versionOf(id), lineId: (await treatmentLine(id)).id, performerId: world.therapistId }));
    await unwrap(finalize(id));
    expect(await treatmentLine(id)).toMatchObject({ unitPrice: 0, performerId: world.therapistId, commissionAmount: 10_000 });
  });
});

// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dateLabel } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addPackageLine, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Paket", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "beli-paket";
const WA = "6281200009604";
let world: BillingWorld;
let packageId: string;
const today = witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

async function draftWithPackage() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
  return id;
}
async function bought() {
  const id = await draftWithPackage();
  const { number } = await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
  const owned = await prisma.patientPackage.findFirstOrThrow({
    where: { purchaseLine: { invoiceId: id } },
    include: { items: { include: { entries: true } } },
  });
  return { id, number, owned };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  packageId = await catalogPackage(world, {
    name: "Glowing",
    price: 900_000,
    validDays: 90,
    items: [
      { serviceId: world.treatmentId, sessions: 3 },
      { serviceId: world.slimmingTreatmentId, sessions: 2 },
    ],
  });
});
beforeEach(async () => {
  actor.role = "RESEPSIONIS";
  await prisma.treatmentPackage.update({ where: { id: packageId }, data: { isActive: true } });
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("paket customer saat tagihan pembelian difinalkan", () => {
  it("membuat paket customer dengan salinan isi, tanggal berlaku, dan buku BELI per treatment", async () => {
    const { id, owned } = await bought();
    const expires = addDaysToDateString(today, 89);
    expect(owned).toMatchObject({ patientId: world.patientId, packageId, name: `${SLUG} Glowing`, price: 900_000, status: "AKTIF", startsOn: day(today), expiresOn: day(expires) });
    expect(owned.items.map((item) => [item.serviceName, item.sessions, item.entries.map((e) => [e.kind, e.delta])])).toEqual([
      ["Facial Uji", 3, [["BELI", 3]]],
      ["Meso Uji", 2, [["BELI", 2]]],
    ]);
    expect((await getInvoiceDetail(id))!.lines[0].packageNote).toBe(`3× Facial Uji, 2× Meso Uji · berlaku s.d. ${dateLabel(expires)}`);

    // Katalog berubah sesudahnya: paket yang sudah dibeli tetap.
    await prisma.treatmentPackageItem.updateMany({ where: { packageId }, data: { sessions: 9 } });
    expect((await prisma.patientPackageItem.findMany({ where: { patientPackageId: owned.id }, orderBy: { sortOrder: "asc" } })).map((i) => i.sessions)).toEqual([3, 2]);
    await prisma.treatmentPackageItem.updateMany({ where: { packageId, serviceId: world.treatmentId }, data: { sessions: 3 } });
    await prisma.treatmentPackageItem.updateMany({ where: { packageId, serviceId: world.slimmingTreatmentId }, data: { sessions: 2 } });
  });

  it("paket yang dinonaktifkan sesudah ditambahkan: finalisasi ditolak dan tidak ada paket customer", async () => {
    const id = await draftWithPackage();
    await prisma.treatmentPackage.update({ where: { id: packageId }, data: { isActive: false } });
    expect(await finalizeInvoice({ invoiceId: id, version: await versionOf(id) })).toEqual({ ok: false, error: `Paket ${SLUG} Glowing sudah tidak dijual. Hapus barisnya.` });
    expect(await prisma.patientPackage.count({ where: { purchaseLine: { invoiceId: id } } })).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe("DRAF");
  });

  it("DP: tagihan paket yang dibayar sebagian tetap membuat paket aktif", async () => {
    const { id, owned } = await bought();
    await unwrap(recordInvoicePayment({ invoiceId: id, amount: 300_000, method: "TUNAI", paidAt: today, reference: "" }));
    expect((await getInvoiceDetail(id))!.totals.display).toBe("SEBAGIAN");
    expect(owned.status).toBe("AKTIF");
  });
});

describe("membatalkan tagihan pembelian paket", () => {
  it("belum terpakai: paket dibatalkan dan sisa sesi dikurangi lewat BATAL_PAKET", async () => {
    const { id, owned } = await bought();
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Salah input" }));
    const after = await prisma.patientPackage.findUniqueOrThrow({ where: { id: owned.id }, include: { items: { include: { entries: { orderBy: { createdAt: "asc" } } } } } });
    expect(after.status).toBe("DIBATALKAN");
    expect(after.items.map((item) => item.entries.map((e) => [e.kind, e.delta]))).toEqual([
      [["BELI", 3], ["BATAL_PAKET", -3]],
      [["BELI", 2], ["BATAL_PAKET", -2]],
    ]);
  });

  it("sesi sudah dipakai di tagihan final lain: pembatalan ditolak dengan nomor tagihan pemakaian", async () => {
    const { id, owned } = await bought();
    // Pemakaian disimulasikan langsung di basis data (aksi pemakaian ada di Task 7).
    const usage = await prisma.invoice.create({
      data: {
        patientId: world.patientId,
        branchId: world.branchId,
        createdById: "s",
        createdByName: "Uji",
        status: "FINAL",
        number: `TG-2031-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        finalizedAt: new Date(),
        lines: { create: [{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 0, patientPackageItemId: owned.items[0].id }] },
      },
      select: { number: true, lines: { select: { id: true } } },
    });
    await prisma.packageSessionEntry.create({ data: { patientPackageItemId: owned.items[0].id, kind: "PAKAI", delta: -1, invoiceLineId: usage.lines[0].id, staffId: "s", staffName: "Uji" } });
    expect(await cancelInvoice({ invoiceId: id, reason: "Salah input" })).toEqual({
      ok: false,
      error: `Sesi paket ${SLUG} Glowing sudah dipakai di tagihan ${usage.number}. Batalkan tagihan itu dulu.`,
    });
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: owned.id } })).status).toBe("AKTIF");
  });
});

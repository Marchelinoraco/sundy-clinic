// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dateLabel } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import {
  addPackageLine,
  applyPackageSession,
  createDirectSale,
  createInvoiceFromVisit,
  refreshCatalogPrices,
  releasePackageSession,
  setLineDiscount,
  updateInvoiceLine,
} from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { listPackageOptions } from "@/server/patient-package-read";
import { loadReceiptSource } from "@/server/receipt-store";
import { buildPublicReceipt } from "@/lib/receipt";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";
import { testApproval } from "./approver";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis Sesi", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "sesi-paket";
const WA = "6281200009605";
const WA_OTHER = "6281200009606";
let world: BillingWorld;
let facial3: string;
const today = witaDateString(new Date());
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
const remaining = async (itemId: string) => (await prisma.packageSessionEntry.aggregate({ where: { patientPackageItemId: itemId }, _sum: { delta: true } }))._sum.delta ?? 0;
const finalize = async (id: string) => finalizeInvoice({ invoiceId: id, version: await versionOf(id) });

async function ownPackage(packageId: string, patientId = world.patientId) {
  const { id } = await unwrap(createDirectSale({ patientId, branchId: world.branchId }));
  await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId }));
  await unwrap(finalize(id));
  const owned = await prisma.patientPackage.findFirstOrThrow({ where: { purchaseLine: { invoiceId: id } }, select: { id: true, name: true, items: { orderBy: { sortOrder: "asc" }, select: { id: true } } } });
  return { purchaseId: id, patientPackageId: owned.id, name: owned.name, itemId: owned.items[0].id };
}
async function visitDraft() {
  const { appointmentId } = await finalVisit(world);
  const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
  const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: id, kind: "TREATMENT" } });
  return { id, line };
}
const apply = async (draft: { id: string; line: { id: string } }, itemId: string) =>
  applyPackageSession({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, patientPackageItemId: itemId });

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, WA_OTHER]);
  world = await createBillingWorld(SLUG, WA);
  facial3 = await catalogPackage(world, { name: "Facial 3x", validDays: 90 });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA, WA_OTHER]);
  await prisma.$disconnect();
});

describe("memakai sesi paket", () => {
  it("baris menjadi Rp 0 tanpa diskon; sesi terpotong saat final; keterangan sisa", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.line.id } })).toMatchObject({ unitPrice: 0, discountAmount: 0, patientPackageItemId: own.itemId });
    expect((await getInvoiceDetail(draft.id))!.lines.find((line) => line.id === draft.line.id)).toMatchObject({
      packageUse: { patientPackageItemId: own.itemId, packageName: own.name },
      packageNote: `Sesi paket ${own.name} · sisa 2 dari 3`,
    });
    expect(await remaining(own.itemId)).toBe(3);
    await unwrap(finalize(draft.id));
    expect(await remaining(own.itemId)).toBe(2);
    expect(await prisma.packageSessionEntry.findFirst({ where: { invoiceLineId: draft.line.id } })).toMatchObject({ kind: "PAKAI", delta: -1, staffName: "Resepsionis Sesi" });
  });

  it("Lepas paket mengembalikan harga katalog; Segarkan harga tidak menyentuh baris sesi", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    await unwrap(refreshCatalogPrices({ invoiceId: draft.id, version: await versionOf(draft.id) }));
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.line.id } })).unitPrice).toBe(0);
    await unwrap(releasePackageSession({ invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.line.id } })).toMatchObject({ unitPrice: 250_000, patientPackageItemId: null });
  });

  it("permintaan buatan: harga, diskon, paket customer lain, dan treatment lain ditolak (Review Focus 4)", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    expect(await updateInvoiceLine({ approval: await testApproval(), invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, quantity: 1, unitPrice: 1000, priceNote: "x" })).toEqual({
      ok: false,
      error: "Baris sesi paket selalu Rp 0. Klik Lepas paket untuk menagih harga biasa.",
    });
    expect(await setLineDiscount({ approval: await testApproval(), invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, kind: "NOMINAL", value: 1, reason: "x" })).toEqual({
      ok: false,
      error: "Baris sesi paket tidak bisa diberi diskon.",
    });

    const other = await prisma.patient.create({ data: { medicalRecordNumber: `SDY-PKT-${Date.now()}`, name: "Customer Lain", whatsapp: WA_OTHER } });
    const foreign = await ownPackage(facial3, other.id);
    const second = await visitDraft();
    expect(await apply(second, foreign.itemId)).toEqual({ ok: false, error: "Paket ini milik customer lain." });

    const meso = await ownPackage(await catalogPackage(world, { name: "Meso 2x", items: [{ serviceId: world.slimmingTreatmentId, sessions: 2 }] }));
    expect(await apply(second, meso.itemId)).toEqual({ ok: false, error: `Paket ${meso.name} tidak berisi treatment Facial Uji.` });
    const consult = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: second.id, kind: "LAYANAN" } });
    expect(await applyPackageSession({ invoiceId: second.id, version: await versionOf(second.id), lineId: consult.id, patientPackageItemId: own.itemId })).toEqual({
      ok: false,
      error: "Hanya baris treatment atau barang dari katalog yang bisa memakai paket.",
    });
  });

  it("dua draf berebut sesi terakhir: draf kedua tidak bisa menandai; tanda bersamaan ditolak saat final", async () => {
    const own = await ownPackage(await catalogPackage(world, { name: "Facial 1x", items: [{ serviceId: world.treatmentId, sessions: 1 }] }));
    const first = await visitDraft();
    const second = await visitDraft();
    await unwrap(apply(first, own.itemId));
    expect(await apply(second, own.itemId)).toEqual({ ok: false, error: `Sesi Facial Uji di paket ${own.name} tinggal 0. Lepas paket atau kurangi jumlahnya.` });
    // Dua kasir menandai bersamaan: tanda kedua dipaksa langsung di basis data.
    await prisma.invoiceLine.update({ where: { id: second.line.id }, data: { unitPrice: 0, patientPackageItemId: own.itemId } });
    await unwrap(finalize(first.id));
    expect(await finalize(second.id)).toEqual({ ok: false, error: `Sesi Facial Uji di paket ${own.name} tinggal 0. Lepas paket atau kurangi jumlahnya.` });
    expect(await remaining(own.itemId)).toBe(0);
  });

  it("paket kedaluwarsa antara ditandai dan difinalkan: finalisasi ditolak, draf utuh (Review Focus 1)", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    const yesterday = addDaysToDateString(today, -1);
    await prisma.patientPackage.update({ where: { id: own.patientPackageId }, data: { startsOn: day(addDaysToDateString(today, -30)), expiresOn: day(yesterday) } });
    expect(await finalize(draft.id)).toEqual({
      ok: false,
      error: `Paket ${own.name} sudah kedaluwarsa ${dateLabel(yesterday)}. Lepas paket atau minta Admin Keuangan memperpanjang.`,
    });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAF");
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.line.id } })).patientPackageItemId).toBe(own.itemId);
  });

  it("tagihan pembelian dibatalkan sementara draf menandai: pembatalan boleh, finalisasi draf ditolak (Review Focus 2)", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: own.purchaseId, reason: "Salah customer" }));
    expect(await finalize(draft.id)).toEqual({ ok: false, error: `Paket ${own.name} sudah dibatalkan. Lepas paket dari baris Facial Uji.` });
  });

  it("jumlah dinaikkan melebihi sisa setelah ditandai: finalisasi ditolak (Review Focus 3)", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    await unwrap(updateInvoiceLine({ approval: await testApproval(), invoiceId: draft.id, version: await versionOf(draft.id), lineId: draft.line.id, quantity: 5, unitPrice: 0, priceNote: "" }));
    expect(await finalize(draft.id)).toEqual({ ok: false, error: `Sesi Facial Uji di paket ${own.name} tinggal 3. Lepas paket atau kurangi jumlahnya.` });
  });

  it("membatalkan tagihan pemakaian mengembalikan sesi, walau paket sudah kedaluwarsa", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    await unwrap(finalize(draft.id));
    await prisma.patientPackage.update({ where: { id: own.patientPackageId }, data: { startsOn: day(addDaysToDateString(today, -30)), expiresOn: day(addDaysToDateString(today, -1)) } });
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: draft.id, reason: "Salah input" }));
    expect(await remaining(own.itemId)).toBe(3);
    expect((await prisma.packageSessionEntry.findMany({ where: { invoiceLineId: draft.line.id }, orderBy: { createdAt: "asc" } })).map((e) => [e.kind, e.delta])).toEqual([
      ["PAKAI", -1],
      ["BATAL_PAKAI", 1],
    ]);
  });

  it("opsi paket di layar: sisa dikurangi baris draf yang sudah menandai", async () => {
    const own = await ownPackage(facial3);
    const draft = await visitDraft();
    await unwrap(apply(draft, own.itemId));
    const option = (await listPackageOptions(world.patientId)).find((o) => o.patientPackageItemId === own.itemId);
    expect(option).toMatchObject({ packageName: own.name, serviceId: world.treatmentId, serviceName: "Facial Uji", sessions: 3, remaining: 2, startsOn: today });
  });

  it("tagihan final dan struk menampilkan sisa dari buku sesi saja, tanpa dikurangi draf lain yang masih terbuka", async () => {
    const own = await ownPackage(facial3);
    const used = await visitDraft();
    await unwrap(apply(used, own.itemId));
    await unwrap(finalize(used.id));
    const pending = await visitDraft();
    await unwrap(apply(pending, own.itemId));
    expect((await getInvoiceDetail(used.id))!.lines.find((line) => line.id === used.line.id)!.packageNote).toBe(`Sesi paket ${own.name} · sisa 2 dari 3`);
    expect(buildPublicReceipt((await loadReceiptSource(used.id))!)!.lines.find((line) => line.name === "Facial Uji")!.note).toBe(`Sesi paket ${own.name} · sisa 2 dari 3`);
    expect((await getInvoiceDetail(pending.id))!.lines.find((line) => line.id === pending.line.id)!.packageNote).toBe(`Sesi paket ${own.name} · sisa 1 dari 3`);
  });
});

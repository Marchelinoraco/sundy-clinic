// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import type { LegacyPackageForm } from "@/lib/legacy-package";
import { addPackageLine, applyPackageSession, createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { cancelLegacyPackage, correctLegacyRemaining, createLegacyPackage } from "@/server/legacy-packages";
import { remainingByItem } from "@/server/package-store";
import { testApproval } from "./approver";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { catalogPackage } from "./package-world";
import { unwrap } from "./unwrap";

// Batalkan paket lama dan Koreksi sisa oleh Admin Keuangan/Super Admin (spec paket lama PL11, bagian 6; rencana Task 5).
type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Staf Keuangan", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "paket-lama-koreksi";
const WA = "6281200009706";
let world: BillingWorld;
let luxId: string;
let facialItemId: string;
const today = witaDateString(new Date());
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

/** Paket lama Lux (4× Facial Uji) dengan `used` sesi sudah dipakai di Kluto, dimasukkan sebagai Super Admin. */
async function legacy(used: number, patch: Partial<LegacyPackageForm> = {}): Promise<{ id: string; itemId: string }> {
  const role = actor.role;
  actor.role = "SUPER_ADMIN";
  try {
    const form: LegacyPackageForm = {
      packageId: luxId,
      boughtOn: "2025-03-01",
      priorVisits: used,
      used: { [facialItemId]: used },
      nextVisitOn: addDaysToDateString(today, 3),
      note: "",
      confirmDuplicate: true,
      ...patch,
    };
    const { patientPackageId } = await unwrap(createLegacyPackage({ patient: { id: world.patientId }, form }));
    const item = await prisma.patientPackageItem.findFirstOrThrow({ where: { patientPackageId } });
    return { id: patientPackageId, itemId: item.id };
  } finally {
    actor.role = role;
  }
}

/** Tagihan kunjungan draf yang menandai satu sesi paket; final bila diminta. */
async function markOneSession(itemId: string, finalize: boolean): Promise<{ id: string; number: string | null }> {
  const role = actor.role;
  actor.role = "SUPER_ADMIN";
  try {
    const { appointmentId } = await finalVisit(world);
    const visit = await unwrap(createInvoiceFromVisit(appointmentId));
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: visit.id, kind: "TREATMENT" } });
    await unwrap(applyPackageSession({ invoiceId: visit.id, version: await versionOf(visit.id), lineId: line.id, patientPackageItemId: itemId }));
    if (!finalize) return { id: visit.id, number: null };
    const final = await unwrap(finalizeInvoice({ invoiceId: visit.id, version: await versionOf(visit.id) }));
    return { id: visit.id, number: final.number };
  } finally {
    actor.role = role;
  }
}
const left = async (itemId: string) => (await remainingByItem(prisma, [itemId])).get(itemId);

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  luxId = await catalogPackage(world, { name: "Lux", items: [{ serviceId: world.treatmentId, sessions: 4 }] });
  facialItemId = (await prisma.treatmentPackageItem.findFirstOrThrow({ where: { packageId: luxId } })).id;
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("membatalkan paket lama", () => {
  it("Resepsionis tidak bisa membatalkan atau mengoreksi", async () => {
    const pkg = await legacy(1);
    actor.role = "RESEPSIONIS";
    await expect(cancelLegacyPackage({ packageId: pkg.id, reason: "x" })).rejects.toThrow("forbidden: invoice:correct");
    await expect(correctLegacyRemaining({ packageId: pkg.id, reason: "x", remaining: { [pkg.itemId]: 1 } })).rejects.toThrow("forbidden: invoice:correct");
  });

  it("paket yang belum dipakai: dibatalkan, sisa dikurangi BATAL_PAKET beralasan, rencana kosong, tercatat", async () => {
    const pkg = await legacy(1);
    expect(await cancelLegacyPackage({ packageId: pkg.id, reason: "" })).toEqual({ ok: false, error: "Isi alasan pembatalan." });
    await unwrap(cancelLegacyPackage({ packageId: pkg.id, reason: " salah pasien " }));
    const owned = await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id }, include: { items: { include: { entries: { where: { kind: "BATAL_PAKET" } } } } } });
    expect(owned).toMatchObject({ status: "DIBATALKAN", nextVisitOn: null });
    expect(owned.items[0].entries.map((e) => [e.delta, e.reason, e.staffName])).toEqual([[-3, "salah pasien", "Staf Keuangan"]]);
    expect(await left(pkg.itemId)).toBe(0);
    expect((await prisma.auditLog.findFirst({ where: { action: "patient-package.legacy-cancel", entityId: pkg.id } }))?.summary).toBe(`${SLUG} Lux: salah pasien`);
    expect(await cancelLegacyPackage({ packageId: pkg.id, reason: "lagi" })).toEqual({ ok: false, error: "Paket ini sudah dibatalkan." });
    expect(await correctLegacyRemaining({ packageId: pkg.id, reason: "x", remaining: { [pkg.itemId]: 1 } })).toEqual({ ok: false, error: "Paket ini sudah dibatalkan." });
  });

  it("paket yang sesinya dipakai di tagihan final ditolak; setelah tagihan itu dibatalkan, boleh", async () => {
    const pkg = await legacy(1);
    const usage = await markOneSession(pkg.itemId, true);
    expect(await cancelLegacyPackage({ packageId: pkg.id, reason: "salah paket" })).toEqual({
      ok: false,
      error: `Sesi paket ini sudah dipakai di tagihan ${usage.number}. Pakai Koreksi sisa.`,
    });
    actor.role = "SUPER_ADMIN";
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: usage.id, reason: "Salah input" }));
    await unwrap(cancelLegacyPackage({ packageId: pkg.id, reason: "salah paket" }));
    expect(await left(pkg.itemId)).toBe(0);
  });

  it("paket yang dijual lewat tagihan tidak bisa dibatalkan atau dikoreksi di sini", async () => {
    actor.role = "SUPER_ADMIN";
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    await unwrap(addPackageLine({ invoiceId: id, version: 1, packageId: luxId }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
    const sold = await prisma.patientPackage.findFirstOrThrow({ where: { purchaseLine: { invoiceId: id } }, include: { items: true } });
    actor.role = "ADMIN_KEUANGAN";
    const message = { ok: false, error: "Hanya paket lama (Kluto) yang bisa diubah di sini." };
    expect(await cancelLegacyPackage({ packageId: sold.id, reason: "x" })).toEqual(message);
    expect(await correctLegacyRemaining({ packageId: sold.id, reason: "x", remaining: { [sold.items[0].id]: 1 } })).toEqual(message);
  });
});

describe("Koreksi sisa", () => {
  it("naik dan turun dengan entri KOREKSI_KLUTO beralasan; batasnya jatah dikurangi pemakaian SunDY; nol mengosongkan rencana", async () => {
    const pkg = await legacy(1); // sisa 3
    await markOneSession(pkg.itemId, true); // sisa 2, terpakai di SunDY 1 → batas 3
    expect(await correctLegacyRemaining({ packageId: pkg.id, reason: "salah hitung", remaining: { [pkg.itemId]: 4 } })).toEqual({
      ok: false,
      error: "Sisa Facial Uji 0–3.",
    });
    expect(await correctLegacyRemaining({ packageId: pkg.id, reason: "salah hitung", remaining: { [pkg.itemId]: 2 } })).toEqual({
      ok: false,
      error: "Tidak ada sisa yang berubah.",
    });
    await unwrap(correctLegacyRemaining({ packageId: pkg.id, reason: "salah hitung", remaining: { [pkg.itemId]: 3 } }));
    expect(await left(pkg.itemId)).toBe(3);
    await unwrap(correctLegacyRemaining({ packageId: pkg.id, reason: "pasien konfirmasi", remaining: { [pkg.itemId]: 0 } }));
    expect(await left(pkg.itemId)).toBe(0);
    const owned = await prisma.patientPackage.findUniqueOrThrow({
      where: { id: pkg.id },
      include: { items: { include: { entries: { where: { kind: "KOREKSI_KLUTO" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } } },
    });
    expect(owned.items[0].entries.map((e) => [e.delta, e.reason])).toEqual([
      [1, "salah hitung"],
      [-3, "pasien konfirmasi"],
    ]);
    expect(owned.nextVisitOn).toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { action: "patient-package.legacy-correct", entityId: pkg.id }, orderBy: { createdAt: "asc" } });
    expect(audit?.summary).toBe(`${SLUG} Lux: Facial Uji 2→3 (salah hitung)`);
  });

  it("koreksi di bawah jumlah yang ditandai draf diterima; finalisasi draf itu lalu ditolak (Review Focus 5)", async () => {
    const pkg = await legacy(2); // sisa 2
    const draft = await markOneSession(pkg.itemId, false);
    await unwrap(correctLegacyRemaining({ packageId: pkg.id, reason: "salah ketik", remaining: { [pkg.itemId]: 0 } }));
    actor.role = "SUPER_ADMIN";
    const result = await finalizeInvoice({ invoiceId: draft.id, version: await versionOf(draft.id) });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("tinggal 0");
  });
});

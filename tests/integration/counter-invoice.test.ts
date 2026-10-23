// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addInvoiceItem, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { listBillingItems } from "@/server/invoice-read";
import { listPrescribableItems } from "@/server/prescription-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";
import { testApproval } from "./approver";

type Role = "SUPER_ADMIN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s1", name: "Rina", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" } }));
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

const SLUG = "tagih-meja";
const WA = "6281200009740";
const today = witaDateString(new Date());
let world: BillingWorld;
let seq = 0;
let itemSeq = 0;

const newItem = () => {
  itemSeq += 1;
  return prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-${itemSeq}`, name: `${SLUG} Barang ${itemSeq}`, kind: "PRODUK", unit: "pcs", sellPrice: 5000 } });
};
const batchOf = (itemId: string, quantity: number, counter: number, days: number | null = 100) => {
  seq += 1;
  return billingBatch(world, { invoiceNumber: `TM-${seq}`, itemId, quantity, counter, expiryDate: days === null ? null : addDaysToDateString(today, days) });
};
async function draftWith(itemId: string, quantity: number) {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
  const { version } = await unwrap(addInvoiceItem({ invoiceId: id, version: 1, itemId, quantity }));
  return { id, version };
}
const sisa = async (batchId: string) => {
  const row = await prisma.stockBatch.findUniqueOrThrow({ where: { id: batchId } });
  return { gudang: row.quantityRemaining, meja: row.counterRemaining };
};

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("tagihan dan stok meja (spec stok meja SM1, 3)", () => {
  it("finalisasi mengurangi meja, gudang tetap; jurnal KELUAR berlokasi MEJA", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 10, 4);
    const { id, version } = await draftWith(item.id, 3);
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    expect(await sisa(b.batchId)).toEqual({ gudang: 6, meja: 1 });
    expect((await prisma.stockMovement.findFirstOrThrow({ where: { invoiceId: id, kind: "KELUAR" } })).location).toBe("MEJA");
  });

  it("meja kurang ditolak walau gudang cukup; tidak ada yang berubah", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 50, 2);
    const { id, version } = await draftWith(item.id, 3);
    expect(await finalizeInvoice({ invoiceId: id, version })).toEqual({
      ok: false,
      error: `Stok meja ${item.name} di Cabang Publik Uji tidak cukup (tersedia 2). Minta restock ke Apoteker.`,
    });
    expect(await sisa(b.batchId)).toEqual({ gudang: 48, meja: 2 });
  });

  it("batch kedaluwarsa di meja tidak dijual (Review Focus 1)", async () => {
    const item = await newItem();
    await batchOf(item.id, 5, 5, -1);
    const { id, version } = await draftWith(item.id, 1);
    const result = await finalizeInvoice({ invoiceId: id, version });
    expect(result).toEqual({ ok: false, error: `Stok meja ${item.name} di Cabang Publik Uji tidak cukup (tersedia 0). Minta restock ke Apoteker.` });
  });

  it("pembatalan mengembalikan stok ke lokasi asal pengambilannya", async () => {
    const item = await newItem();
    const b = await batchOf(item.id, 10, 5);
    const { id, version } = await draftWith(item.id, 2);
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    actor.role = "SUPER_ADMIN";
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: id, reason: "Salah input" }));
    expect(await sisa(b.batchId)).toEqual({ gudang: 5, meja: 5 });
    const back = await prisma.stockMovement.findFirstOrThrow({ where: { invoiceId: id, kind: "PENYESUAIAN" } });
    expect(back.location).toBe("MEJA");

    // Tagihan dari sebelum fitur ini mengambil dari gudang: pembatalannya mengembalikan ke gudang.
    actor.role = "RESEPSIONIS";
    const old = await draftWith(item.id, 1);
    await unwrap(finalizeInvoice({ invoiceId: old.id, version: old.version }));
    await prisma.stockMovement.updateMany({ where: { invoiceId: old.id, kind: "KELUAR" }, data: { location: "GUDANG" } });
    actor.role = "SUPER_ADMIN";
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: old.id, reason: "Salah input" }));
    expect(await sisa(b.batchId)).toEqual({ gudang: 6, meja: 4 });
  });

  it("daftar barang tagihan menampilkan stok meja; dokter melihat gudang + meja", async () => {
    const item = await newItem();
    await batchOf(item.id, 10, 3);
    expect((await listBillingItems(world.branchId)).find((i) => i.id === item.id)?.available).toBe(3);
    expect((await listPrescribableItems(world.branchId, [])).find((i) => i.id === item.id)?.available).toBe(10);
  });
});

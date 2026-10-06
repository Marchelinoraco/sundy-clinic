// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { PurchaseInput } from "@/lib/stock";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { getPurchaseDetail, listPurchases } from "@/server/purchase-read";
import { cancelPurchase, createPurchase } from "@/server/purchases";
import { cleanupStockWorld, createStockWorld, type StockWorld } from "./stock-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "APOTEKER" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Apoteker Uji", role: "APOTEKER" as Role, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "masuk-stok";
const today = witaDateString(new Date());
const nextYear = addDaysToDateString(today, 365);
const CANNOT_CANCEL =
  "Faktur tidak bisa dibatalkan karena sudah ada pembayaran, retur, atau stok yang terpakai. Koreksi lewat penyesuaian atau retur.";

describe("barang masuk dari supplier", () => {
  let world: StockWorld;
  let seq = 0;

  const purchase = (patch: Partial<PurchaseInput> = {}): PurchaseInput => {
    seq += 1;
    return {
      supplierId: world.supplierId,
      branchId: world.branchId,
      invoiceNumber: `MS-${seq}`,
      invoiceDate: today,
      dueDate: addDaysToDateString(today, 30),
      notes: "",
      lines: [
        { itemId: world.drugId, quantity: 10, unitCost: 5000, batchNumber: "B-01", expiryDate: nextYear },
        { itemId: world.productId, quantity: 2, unitCost: 75000, batchNumber: "", expiryDate: "" },
      ],
      ...patch,
    };
  };

  beforeAll(async () => {
    await cleanupStockWorld(SLUG);
    world = await createStockWorld(SLUG);
  });

  beforeEach(() => {
    actor.role = "APOTEKER";
  });

  afterAll(async () => {
    await cleanupStockWorld(SLUG);
    await prisma.$disconnect();
  });

  it("mencatat faktur, batch per baris, dan jurnal MASUK dalam satu transaksi", async () => {
    const input = purchase();
    const { id } = await unwrap(createPurchase(input));

    const invoice = await prisma.purchaseInvoice.findUniqueOrThrow({
      where: { id },
      include: { lines: { orderBy: { sortOrder: "asc" }, include: { batch: { include: { movements: true } } } } },
    });
    expect(invoice).toMatchObject({ invoiceNumber: input.invoiceNumber, total: 50000 + 150000, createdByName: "Apoteker Uji" });
    expect(invoice.lines.map((line) => [line.quantity, line.batch?.quantityRemaining, line.batch?.unitCost, line.batch?.branchId])).toEqual([
      [10, 10, 5000, world.branchId],
      [2, 2, 75000, world.branchId],
    ]);
    expect(invoice.lines.flatMap((line) => line.batch?.movements.map((m) => [m.kind, m.quantity]) ?? [])).toEqual([
      ["MASUK", 10],
      ["MASUK", 2],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "purchase.create", entityId: id } })).toBe(1);

    const detail = await getPurchaseDetail(id);
    expect(detail).toMatchObject({ total: 200000, summary: { balance: 200000, status: "BELUM_DIBAYAR" }, canCancel: true, payments: null });
    expect(detail?.lines[0]).toMatchObject({ itemName: `${SLUG} Amoxicillin 500 mg`, amount: 50000, batchRemaining: 10, expiryDate: nextYear });
    const row = (await listPurchases()).find((r) => r.id === id);
    expect(row).toMatchObject({ lineCount: 2, status: "BELUM_DIBAYAR", supplierName: world.supplierName });
  });

  it("faktur yang sama dari supplier yang sama hanya tercatat sekali, termasuk bila dikirim bersamaan", async () => {
    const input = purchase();
    const results = await Promise.all([createPurchase(input), createPurchase(input)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({
      ok: false,
      error: `Faktur ${input.invoiceNumber} dari ${world.supplierName} sudah tercatat.`,
    });
    expect(await prisma.purchaseInvoice.count({ where: { invoiceNumber: input.invoiceNumber, supplierId: world.supplierId } })).toBe(1);

    const other = await prisma.supplier.create({ data: { name: `${SLUG} Lain` } });
    expect((await createPurchase({ ...input, supplierId: other.id })).ok).toBe(true);
  });

  it("menolak permintaan buatan di server", async () => {
    const line = (patch: Record<string, unknown>) => purchase({ lines: [{ ...purchase().lines[0], ...patch } as PurchaseInput["lines"][number]] });
    expect(await createPurchase(line({ quantity: 1.5 }))).toEqual({ ok: false, error: "Baris 1: jumlah harus bilangan bulat lebih dari 0." });
    expect(await createPurchase(line({ unitCost: -1 }))).toEqual({ ok: false, error: "Baris 1: harga beli tidak sah." });
    expect(await createPurchase(line({ expiryDate: "" }))).toEqual({ ok: false, error: "Baris 1: isi tanggal kedaluwarsa obat." });
    expect(await createPurchase(line({ expiryDate: addDaysToDateString(today, -1) }))).toEqual({
      ok: false,
      error: "Baris 1: barang ini sudah kedaluwarsa.",
    });
    expect(await createPurchase(purchase({ invoiceDate: addDaysToDateString(today, 1) }))).toEqual({
      ok: false,
      error: "Tanggal faktur tidak boleh di masa depan.",
    });
    expect(await createPurchase(purchase({ branchId: world.comingSoonBranchId }))).toEqual({
      ok: false,
      error: "Cabang ini belum bisa menerima barang.",
    });

    const inactive = await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-OFF`, name: `${SLUG} Off`, kind: "PRODUK", unit: "pcs", isActive: false } });
    expect(await createPurchase(line({ itemId: inactive.id }))).toEqual({ ok: false, error: "Baris 1: pilih barang yang aktif." });

    const closed = await prisma.supplier.create({ data: { name: `${SLUG} Tutup`, isActive: false } });
    expect(await createPurchase(purchase({ supplierId: closed.id }))).toEqual({ ok: false, error: "Pilih supplier yang aktif." });
  });

  it("batalkan faktur yang masih utuh: stok batch ditarik lewat penyesuaian, faktur tetap tercatat", async () => {
    const { id } = await unwrap(createPurchase(purchase()));
    expect(await cancelPurchase({ invoiceId: id, reason: " " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(cancelPurchase({ invoiceId: id, reason: "Harga beli salah ketik" }));

    const detail = await getPurchaseDetail(id);
    expect(detail).toMatchObject({ cancelReason: "Harga beli salah ketik", cancelledByName: "Apoteker Uji", summary: { status: "DIBATALKAN" }, canCancel: false });
    expect(detail?.lines.map((line) => line.batchRemaining)).toEqual([0, 0]);
    const movements = await prisma.stockMovement.findMany({ where: { batch: { purchaseLine: { invoiceId: id } }, kind: "PENYESUAIAN" } });
    expect(movements.map((m) => [m.quantity, m.reason, m.note]).sort()).toEqual([
      [-10, "LAINNYA", "Faktur dibatalkan"],
      [-2, "LAINNYA", "Faktur dibatalkan"],
    ].sort());
    expect(await cancelPurchase({ invoiceId: id, reason: "lagi" })).toEqual({ ok: false, error: "Faktur ini sudah dibatalkan." });
    expect(await prisma.auditLog.count({ where: { action: "purchase.cancel", entityId: id } })).toBe(1);
  });

  it("tidak bisa membatalkan faktur yang sudah dibayar atau stoknya terpakai", async () => {
    const paid = await unwrap(createPurchase(purchase()));
    await prisma.supplierPayment.create({
      data: { invoiceId: paid.id, kind: "BAYAR", amount: 1000, method: "TUNAI", paidAt: new Date(`${today}T00:00:00Z`), staffId: "s2", staffName: "Keuangan" },
    });
    expect(await cancelPurchase({ invoiceId: paid.id, reason: "salah" })).toEqual({ ok: false, error: CANNOT_CANCEL });

    const used = await unwrap(createPurchase(purchase()));
    const batch = await prisma.stockBatch.findFirstOrThrow({ where: { purchaseLine: { invoiceId: used.id } } });
    await prisma.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { decrement: 1 } } });
    await prisma.stockMovement.create({ data: { batchId: batch.id, kind: "PENYESUAIAN", quantity: -1, reason: "RUSAK", staffId: "s1", staffName: "Uji" } });
    expect((await getPurchaseDetail(used.id))?.canCancel).toBe(false);
    expect(await cancelPurchase({ invoiceId: used.id, reason: "salah" })).toEqual({ ok: false, error: CANNOT_CANCEL });
  });

  it("hak akses: Admin Keuangan tidak mencatat barang masuk tetapi boleh membatalkan dan melihat pembayaran; Resepsionis tidak keduanya", async () => {
    const { id } = await unwrap(createPurchase(purchase()));
    actor.role = "ADMIN_KEUANGAN";
    await expect(createPurchase(purchase())).rejects.toThrow(/forbidden: stock:manage/);
    expect((await getPurchaseDetail(id))?.payments).toEqual([]);
    await unwrap(cancelPurchase({ invoiceId: id, reason: "Faktur ganda" }));

    actor.role = "RESEPSIONIS";
    await expect(cancelPurchase({ invoiceId: id, reason: "x" })).rejects.toThrow(/forbidden: stock:read/);
    await expect(listPurchases()).rejects.toThrow(/forbidden: stock:read/);
  });
});

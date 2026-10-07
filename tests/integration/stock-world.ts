import { prisma } from "@/lib/db";

/**
 * Dunia uji stok: satu cabang aktif, satu cabang *Segera hadir*, satu supplier, satu obat, dan
 * satu produk. Semua diberi awalan `slug` agar setiap berkas uji membersihkan miliknya sendiri.
 */
export type StockWorld = {
  slug: string;
  branchId: string;
  comingSoonBranchId: string;
  supplierId: string;
  supplierName: string;
  drugId: string;
  productId: string;
};

const day = (value: string) => new Date(`${value}T00:00:00Z`);

export async function createStockWorld(slug: string): Promise<StockWorld> {
  const code = slug.toUpperCase();
  const branch = await prisma.branch.create({
    data: { slug, name: `Cabang ${slug}`, address: "Jl. Uji Stok 1", whatsapp: "6285172228900", openingHours: "-", status: "AKTIF", sortOrder: 90 },
  });
  const comingSoon = await prisma.branch.create({
    data: {
      slug: `${slug}-segera`,
      name: `Cabang ${slug} segera`,
      address: "Jl. Uji Stok 2",
      whatsapp: "6285172228900",
      openingHours: "-",
      status: "SEGERA_HADIR",
      sortOrder: 91,
    },
  });
  const supplier = await prisma.supplier.create({ data: { name: `${slug} Farma` } });
  const drug = await prisma.stockItem.create({
    data: { code: `${code}-OBT`, name: `${slug} Amoxicillin 500 mg`, kind: "OBAT", unit: "kapsul", sellPrice: 2000, minStock: 20 },
  });
  const product = await prisma.stockItem.create({
    data: { code: `${code}-PRD`, name: `${slug} Serum C`, kind: "PRODUK", unit: "botol", sellPrice: 150000, minStock: 0 },
  });
  return {
    slug,
    branchId: branch.id,
    comingSoonBranchId: comingSoon.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    drugId: drug.id,
    productId: product.id,
  };
}

/** Faktur satu baris + batch + jurnal MASUK, dibuat langsung di basis data (tanpa aksi server). */
export async function seedBatch(
  world: Pick<StockWorld, "supplierId" | "branchId">,
  input: {
    invoiceNumber: string;
    itemId: string;
    quantity: number;
    unitCost?: number;
    expiryDate?: string | null;
    branchId?: string;
    invoiceDate?: string;
    dueDate?: string;
  },
): Promise<{ invoiceId: string; batchId: string }> {
  const unitCost = input.unitCost ?? 1000;
  const invoice = await prisma.purchaseInvoice.create({
    data: {
      supplierId: world.supplierId,
      branchId: input.branchId ?? world.branchId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: day(input.invoiceDate ?? "2026-10-01"),
      dueDate: day(input.dueDate ?? "2026-10-31"),
      total: input.quantity * unitCost,
      createdById: "seed",
      createdByName: "Seed",
    },
  });
  const expiryDate = input.expiryDate ? day(input.expiryDate) : null;
  const line = await prisma.purchaseLine.create({
    data: { invoiceId: invoice.id, itemId: input.itemId, quantity: input.quantity, unitCost, expiryDate },
  });
  const batch = await prisma.stockBatch.create({
    data: {
      itemId: input.itemId,
      branchId: invoice.branchId,
      purchaseLineId: line.id,
      expiryDate,
      unitCost,
      quantityReceived: input.quantity,
      quantityRemaining: input.quantity,
    },
  });
  await prisma.stockMovement.create({
    data: { batchId: batch.id, kind: "MASUK", quantity: input.quantity, staffId: "seed", staffName: "Seed" },
  });
  return { invoiceId: invoice.id, batchId: batch.id };
}

/** Menghapus semua data dunia uji, dari anak ke induk (relasi stok memakai Restrict). */
export async function cleanupStockWorld(slug: string): Promise<void> {
  const branch = { slug: { startsWith: slug } };
  await prisma.stockMovement.deleteMany({ where: { batch: { branch } } });
  await prisma.supplierReturnLine.deleteMany({ where: { batch: { branch } } });
  await prisma.supplierReturn.deleteMany({ where: { invoice: { branch } } });
  await prisma.supplierPayment.deleteMany({ where: { invoice: { branch } } });
  await prisma.stockBatch.deleteMany({ where: { branch } });
  await prisma.purchaseLine.deleteMany({ where: { invoice: { branch } } });
  await prisma.purchaseInvoice.deleteMany({ where: { branch } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: slug } } });
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: slug.toUpperCase() } } });
  await prisma.branch.deleteMany({ where: branch });
}

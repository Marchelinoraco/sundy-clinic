import { prisma } from "@/lib/db";
import { buildInvoiceA4, type InvoiceA4, type InvoiceA4Package } from "@/lib/invoice-a4";
import { dateLabel, dateOnlyString } from "@/lib/stock";
import { packageContentsLabel } from "@/lib/treatment-package";

/**
 * Data invoice A4 (spec invoice A4). Modul biasa: pemanggil memeriksa hak atau kode tautan. Kolom dipilih satu per satu:
 * tanpa harga pokok, biaya, atau catatan internal.
 */

type Snapshot = InvoiceA4Package & { purchaseLineId: string; itemIds: string[] };

/**
 * Paket yang dibeli atau dipakai di invoice ini, menurut buku sesi sesaat sesudah invoice difinalkan (IA6, IA10): batasnya
 * entri BELI/PAKAI terakhir milik baris invoice ini, atau waktu final bila tidak ada. Pembatalan dan perpanjangan
 * sesudahnya tidak mengubah angka invoice ini.
 */
async function packageSnapshots(invoiceId: string, finalizedAt: Date): Promise<Snapshot[]> {
  const packages = await prisma.patientPackage.findMany({
    where: { OR: [{ purchaseLine: { invoiceId } }, { items: { some: { entries: { some: { kind: "PAKAI", invoiceLine: { invoiceId } } } } } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, expiresOn: true, purchaseLineId: true, items: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceName: true, unit: true, sessions: true } } },
  });
  if (packages.length === 0) return [];
  const own = await prisma.packageSessionEntry.aggregate({ where: { kind: { in: ["BELI", "PAKAI"] }, invoiceLine: { invoiceId } }, _max: { createdAt: true } });
  const cutoff = own._max.createdAt ?? finalizedAt;
  const entries = await prisma.packageSessionEntry.findMany({
    where: { item: { patientPackageId: { in: packages.map((pkg) => pkg.id) } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { patientPackageItemId: true, kind: true, delta: true, createdAt: true, previousExpiresOn: true, newExpiresOn: true, item: { select: { patientPackageId: true } } },
  });
  return packages.map((pkg) => {
    const mine = entries.filter((entry) => entry.item.patientPackageId === pkg.id);
    const extensions = mine.filter((entry) => entry.kind === "PERPANJANG");
    const before = extensions.filter((entry) => entry.createdAt <= cutoff).at(-1)?.newExpiresOn;
    const after = extensions.find((entry) => entry.createdAt > cutoff)?.previousExpiresOn;
    const known = mine.filter((entry) => entry.createdAt <= cutoff);
    return {
      name: pkg.name,
      expiresOn: dateOnlyString(before ?? after ?? pkg.expiresOn),
      purchaseLineId: pkg.purchaseLineId,
      itemIds: pkg.items.map((item) => item.id),
      items: pkg.items.map((item) => {
        const rows = known.filter((entry) => entry.patientPackageItemId === item.id);
        const used = -rows.filter((entry) => entry.kind === "PAKAI" || entry.kind === "BATAL_PAKAI").reduce((sum, entry) => sum + entry.delta, 0);
        const remaining = rows.reduce((sum, entry) => sum + entry.delta, 0);
        return { name: item.serviceName, unit: item.unit, total: item.sessions, used, remaining };
      }),
    };
  });
}

/** Invoice A4 tagihan final atau dibatalkan; null untuk draf atau tagihan yang tidak ada. */
export async function loadInvoiceA4(invoiceId: string): Promise<InvoiceA4 | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: String(invoiceId ?? "") },
    select: {
      id: true,
      number: true,
      status: true,
      finalizedAt: true,
      finalizedByName: true,
      discountKind: true,
      discountValue: true,
      patient: { select: { name: true, medicalRecordNumber: true } },
      branch: { select: { name: true, address: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, kind: true, name: true, quantity: true, unitPrice: true, discountAmount: true, discountSource: true, patientPackageItemId: true, itemId: true },
      },
      payments: { orderBy: { createdAt: "asc" }, select: { amount: true, method: true, paidAt: true, revokedAt: true, destinationLabel: true } },
    },
  });
  if (!invoice || invoice.status === "DRAF" || !invoice.finalizedAt) return null;
  const snapshots = await packageSnapshots(invoice.id, invoice.finalizedAt);
  // Baris tagihan hanya menyimpan id barang; satuannya dibaca dari stok untuk kolom Jumlah ("7 kapsul").
  const itemIds = invoice.lines.flatMap((line) => (line.itemId ? [line.itemId] : []));
  const units = new Map((await prisma.stockItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, unit: true } })).map((item) => [item.id, item.unit]));
  // Keterangan baris paket diambil dari snapshot yang sama, supaya cocok dengan kotak "Paket Anda" (IA6).
  const noteOf = (line: (typeof invoice.lines)[number]): string | null => {
    const bought = snapshots.find((pkg) => pkg.purchaseLineId === line.id);
    if (bought) return `${packageContentsLabel(bought.items.map((item) => ({ name: item.name, sessions: item.total, unit: item.unit })))} · berlaku s.d. ${dateLabel(bought.expiresOn)}`;
    const used = line.patientPackageItemId ? snapshots.find((pkg) => pkg.itemIds.includes(line.patientPackageItemId!)) : undefined;
    if (used) return `${line.kind === "BARANG" ? "Jatah" : "Sesi"} paket ${used.name}`;
    return null;
  };
  return buildInvoiceA4(
    { ...invoice, lines: invoice.lines.map((line) => ({ ...line, unit: line.itemId ? (units.get(line.itemId) ?? null) : null, note: noteOf(line) })) },
    snapshots.map(({ name, expiresOn, items }) => ({ name, expiresOn, items })),
  );
}

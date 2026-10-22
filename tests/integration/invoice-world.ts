import { prisma } from "@/lib/db";
import { cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
import { purgeEncounters } from "../purge-encounters";
import { seedBatch } from "./stock-world";

/**
 * Dunia uji tagihan: dunia booking (cabang, dokter, terapis, layanan) ditambah satu pasien,
 * satu supplier, satu obat (harga jual Rp 2.000) dan satu produk (Rp 150.000). Semua stok
 * ada di cabang dunia booking, karena tagihan mengambil stok dari cabangnya sendiri.
 */
export type BillingWorld = BookingWorld & {
  slug: string;
  patientId: string;
  supplierId: string;
  drugId: string;
  productId: string;
};

const day = (value: string) => new Date(`${value}T00:00:00Z`);

export async function createBillingWorld(slug: string, whatsapp: string): Promise<BillingWorld> {
  const world = await createBookingWorld(slug);
  const code = slug.toUpperCase();
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-2026-${Math.floor(Math.random() * 9000 + 1000)}`, name: `Pasien ${slug}`, whatsapp },
  });
  const supplier = await prisma.supplier.create({ data: { name: `${slug} Farma` } });
  const drug = await prisma.stockItem.create({
    data: { code: `${code}-OBT`, name: `${slug} Amoxicillin`, kind: "OBAT", unit: "kapsul", sellPrice: 2000 },
  });
  const product = await prisma.stockItem.create({
    data: { code: `${code}-PRD`, name: `${slug} Serum C`, kind: "PRODUK", unit: "botol", sellPrice: 150000 },
  });
  return { ...world, slug, patientId: patient.id, supplierId: supplier.id, drugId: drug.id, productId: product.id };
}

/**
 * Faktur satu baris + batch + jurnal di cabang dunia ini (tanpa aksi server). Bawaannya seluruh jumlah sudah di
 * meja, karena tagihan mengambil stok meja (spec stok meja SM1); `counter: 0` untuk stok gudang saja.
 */
export function billingBatch(
  world: BillingWorld,
  input: { invoiceNumber: string; itemId: string; quantity: number; unitCost?: number; expiryDate?: string | null; counter?: number },
) {
  return seedBatch(world, { ...input, unitCost: input.unitCost ?? 1000, counter: input.counter ?? input.quantity });
}

let visitCount = 0;

/**
 * Kunjungan final: booking Hadir + catatan dokter final dengan treatment. `treatments` bawaan
 * satu Facial Uji. Setiap kunjungan memakai jam sendiri agar penjaga anti-bentrok tidak menolaknya.
 */
export async function finalVisit(
  world: BillingWorld,
  input: {
    treatments?: { serviceId: string; serviceName: string }[];
    /** Pelaksana di catatan kunjungan; null = kunjungan sesudah spec aturan pakai PL1 (dokter tidak memilih). */
    performer?: "therapist" | null;
    channel?: "KLINIK" | "ONLINE";
    serviceId?: string;
    finalizedAt?: Date;
    pharmacyNote?: string;
    /** Paket yang disarankan dokter di resep (spec vital perawat PR1), ditulis sebelum kunjungan final. */
    packages?: { packageId: string; packageName: string; contents: string }[];
  } = {},
): Promise<{ appointmentId: string; encounterId: string }> {
  visitCount += 1;
  const startAt = new Date(Date.UTC(2031, 0, 1, 0, 0) + visitCount * 60 * 60_000);
  const online = input.channel === "ONLINE";
  const appointment = await prisma.appointment.create({
    data: {
      code: `BIL-${world.slug.slice(0, 4).toUpperCase()}-${visitCount}`,
      type: "KONSULTASI",
      channel: online ? "ONLINE" : "KLINIK",
      servicePrice: online ? 250000 : null,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: online ? "WHATSAPP" : "WALK_IN",
      branchId: world.branchId,
      staffId: world.doctorId,
      serviceId: input.serviceId ?? world.consultationId,
      patientId: world.patientId,
    },
  });
  const treatments = input.treatments ?? [{ serviceId: world.treatmentId, serviceName: "Facial Uji" }];
  const encounter = await prisma.encounter.create({
    data: {
      appointmentId: appointment.id,
      createdById: world.doctorId,
      createdByName: "dr. Uji",
      pharmacyNote: input.pharmacyNote ?? null,
      treatments: {
        create: treatments.map((t, index) => ({
          serviceId: t.serviceId,
          serviceName: t.serviceName,
          performerId: input.performer === null ? null : world.therapistId,
          performerName: input.performer === null ? null : "Terapis Uji",
          sortOrder: index,
        })),
      },
      packages: { create: (input.packages ?? []).map((p, index) => ({ ...p, sortOrder: index })) },
    },
  });
  await prisma.encounter.update({
    where: { id: encounter.id },
    data: { status: "FINAL", assessment: "Uji", finalizedAt: input.finalizedAt ?? new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
  });
  return { appointmentId: appointment.id, encounterId: encounter.id };
}

/** Penyerahan langsung di basis data (tanpa aksi server). `lines` bawaan kosong; status bawaan MENUNGGU. */
export async function seedDispensing(
  world: BillingWorld,
  appointmentId: string,
  input: { status?: "MENUNGGU" | "SELESAI" | "TANPA_OBAT"; lines?: { itemId: string; quantity: number; usage?: string }[] } = {},
): Promise<{ id: string; lineIds: string[] }> {
  const status = input.status ?? "MENUNGGU";
  const done = status === "MENUNGGU" ? {} : { completedAt: new Date(), completedById: world.doctorId, completedByName: "Apoteker Uji" };
  const names = new Map(
    (await prisma.stockItem.findMany({ select: { id: true, name: true } })).map((item) => [item.id, item.name] as const),
  );
  const dispensing = await prisma.dispensing.create({
    data: {
      appointmentId,
      branchId: world.branchId,
      status,
      ...done,
      lines: {
        create: (input.lines ?? []).map((line, index) => ({
          itemId: line.itemId,
          itemName: names.get(line.itemId) ?? "Obat",
          quantity: line.quantity,
          usage: line.usage ?? "3 x 1 sesudah makan",
          sortOrder: index,
        })),
      },
    },
    select: { id: true, lines: { orderBy: { sortOrder: "asc" }, select: { id: true } } },
  });
  return { id: dispensing.id, lineIds: dispensing.lines.map((line) => line.id) };
}

/** Menghapus semua data dunia uji, dari anak ke induk (relasi tagihan dan stok memakai Restrict). */
export async function cleanupBillingWorld(slug: string, patientWhatsapps: string[] = []): Promise<void> {
  const branch = { slug: { startsWith: slug } };
  // Paket treatment (rencana paket Task 1): buku sesi → lepas baris pemakaian → paket customer → (baris tagihan) → katalog.
  await prisma.packageSessionEntry.deleteMany({
    where: { OR: [{ invoiceLine: { invoice: { branch } } }, { item: { patientPackage: { purchaseLine: { invoice: { branch } } } } }] },
  });
  await prisma.invoiceLine.updateMany({ where: { invoice: { branch }, patientPackageItemId: { not: null } }, data: { patientPackageItemId: null } });
  await prisma.patientPackage.deleteMany({ where: { purchaseLine: { invoice: { branch } } } });
  await prisma.invoiceStockUse.deleteMany({ where: { line: { invoice: { branch } } } });
  await prisma.invoicePayment.deleteMany({ where: { invoice: { branch } } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { branch } } });
  await prisma.invoice.deleteMany({ where: { branch } });
  // Resep dokter merujuk barang dan paket katalog (Restrict) dan terkunci bersama kunjungan final: kunjungan uji
  // dibersihkan sebelum katalog dan barang.
  await purgeEncounters(prisma);
  await prisma.treatmentPackage.deleteMany({ where: { name: { startsWith: slug } } });
  await prisma.expense.deleteMany({ where: { branch } });
  await prisma.recurringExpense.deleteMany({ where: { branch } });
  // Permintaan restock merujuk cabang dan barang (Restrict); barisnya ikut terhapus (Cascade).
  await prisma.restockRequest.deleteMany({ where: { branch } });
  await prisma.dispensingLine.deleteMany({ where: { dispensing: { branch } } });
  await prisma.dispensing.deleteMany({ where: { branch } });
  await prisma.stockMovement.deleteMany({ where: { batch: { branch } } });
  await prisma.stockBatch.deleteMany({ where: { branch } });
  await prisma.supplierPayment.deleteMany({ where: { invoice: { branch } } });
  await prisma.purchaseLine.deleteMany({ where: { invoice: { branch } } });
  await prisma.purchaseInvoice.deleteMany({ where: { branch } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: slug } } });
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: slug.toUpperCase() } } });
  await prisma.biaFile.deleteMany({ where: { measurement: { appointment: { branch } } } });
  await prisma.biaMeasurement.deleteMany({ where: { appointment: { branch } } });
  await cleanupBookingWorld(slug, patientWhatsapps);
}

export { day };

/**
 * Pelaksana terapis dunia ini untuk setiap baris treatment draf yang belum punya (spec aturan pakai PL3), langsung di
 * basis data agar nomor versi tagihan tidak berubah. Dipakai uji yang memfinalkan tagihan berisi treatment tanpa pelaksana.
 */
export async function assignPerformers(world: BillingWorld, invoiceId: string): Promise<void> {
  const therapist = await prisma.staff.findUniqueOrThrow({ where: { id: world.therapistId }, select: { name: true } });
  await prisma.invoiceLine.updateMany({ where: { invoiceId, kind: "TREATMENT", performerId: null }, data: { performerId: world.therapistId, performerName: therapist.name } });
}

import { prisma } from "@/lib/db";
import { cleanupBookingWorld, createBookingWorld, type BookingWorld } from "./public-booking-world";
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

/** Faktur satu baris + batch + jurnal MASUK di cabang dunia ini (tanpa aksi server). */
export function billingBatch(
  world: BillingWorld,
  input: { invoiceNumber: string; itemId: string; quantity: number; unitCost?: number; expiryDate?: string | null },
) {
  return seedBatch(world, { ...input, unitCost: input.unitCost ?? 1000 });
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
    channel?: "KLINIK" | "ONLINE";
    serviceId?: string;
    finalizedAt?: Date;
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
      treatments: {
        create: treatments.map((t, index) => ({
          serviceId: t.serviceId,
          serviceName: t.serviceName,
          performerId: world.therapistId,
          performerName: "Terapis Uji",
          sortOrder: index,
        })),
      },
    },
  });
  await prisma.encounter.update({
    where: { id: encounter.id },
    data: { status: "FINAL", assessment: "Uji", finalizedAt: input.finalizedAt ?? new Date(), finalizedById: world.doctorId, finalizedByName: "dr. Uji" },
  });
  return { appointmentId: appointment.id, encounterId: encounter.id };
}

/** Menghapus semua data dunia uji, dari anak ke induk (relasi tagihan dan stok memakai Restrict). */
export async function cleanupBillingWorld(slug: string, patientWhatsapps: string[] = []): Promise<void> {
  const branch = { slug: { startsWith: slug } };
  await prisma.invoiceStockUse.deleteMany({ where: { line: { invoice: { branch } } } });
  await prisma.invoicePayment.deleteMany({ where: { invoice: { branch } } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { branch } } });
  await prisma.invoice.deleteMany({ where: { branch } });
  await prisma.stockMovement.deleteMany({ where: { batch: { branch } } });
  await prisma.stockBatch.deleteMany({ where: { branch } });
  await prisma.purchaseLine.deleteMany({ where: { invoice: { branch } } });
  await prisma.purchaseInvoice.deleteMany({ where: { branch } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: slug } } });
  await prisma.stockItem.deleteMany({ where: { code: { startsWith: slug.toUpperCase() } } });
  await cleanupBookingWorld(slug, patientWhatsapps);
}

export { day };

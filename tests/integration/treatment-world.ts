import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import type { BillingWorld } from "./invoice-world";

// Pasien, kunjungan treatment, booking, dan paket uji untuk pengingat treatment (spec pengingat treatment).

export type TreatmentLine = { serviceId: string | null; name: string; kind?: "LAYANAN" | "TREATMENT"; patientPackageItemId?: string };

const day = (value: string) => new Date(`${value}T00:00:00Z`);

export function treatmentWorld(world: BillingWorld, opts: { prefix: string; waBase: number }) {
  const today = witaDateString(new Date());
  const whatsapps: string[] = [];
  let seq = 0;
  const unique = () => `${opts.prefix}-${++seq}-${Date.now() % 100000}`;

  async function patient(name: string, whatsapp?: string) {
    const wa = whatsapp ?? String(opts.waBase + whatsapps.length + 1);
    whatsapps.push(wa);
    return (await prisma.patient.create({ data: { medicalRecordNumber: `SDY-${unique()}`, name, whatsapp: wa } })).id;
  }

  /** Kunjungan `on` pukul `time` WITA dengan tagihan berisi `lines`; tanpa booking bila `direct`. */
  async function visit(patientId: string, on: string, lines: TreatmentLine[], o: { time?: string; status?: "FINAL" | "DIBATALKAN"; direct?: boolean } = {}) {
    const [h, m] = (o.time ?? "10:00").split(":").map(Number);
    const startAt = combineWitaDateAndMinutes(on, h * 60 + m);
    const appointment = o.direct
      ? null
      : await prisma.appointment.create({
          data: {
            code: unique(), type: "TREATMENT", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status: "SELESAI", source: "WALK_IN",
            branchId: world.branchId, staffId: world.doctorId, serviceId: world.treatmentId, patientId,
          },
        });
    const status = o.status ?? "FINAL";
    return prisma.invoice.create({
      data: {
        patientId, branchId: world.branchId, appointmentId: appointment?.id ?? null, status, number: `TG-${unique()}`,
        finalizedAt: startAt, cancelledAt: status === "DIBATALKAN" ? new Date() : null, createdById: "s", createdByName: "Uji",
        lines: {
          create: lines.map((line, index) => ({
            kind: line.kind ?? "TREATMENT", name: line.name, quantity: 1, unitPrice: line.patientPackageItemId ? 0 : 100_000, serviceId: line.serviceId,
            patientPackageItemId: line.patientPackageItemId ?? null, sortOrder: index,
          })),
        },
      },
    });
  }

  async function booking(patientId: string, on: string, status: "TERKONFIRMASI" | "SELESAI") {
    const startAt = combineWitaDateAndMinutes(on, 9 * 60);
    return prisma.appointment.create({
      data: {
        code: unique(), type: "KONSULTASI", startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), status, source: "WHATSAPP",
        branchId: world.branchId, staffId: world.doctorId, serviceId: world.consultationId, patientId,
      },
    });
  }

  /** Paket pasien dengan satu isi `serviceId`; `nextVisitOn` null = sesinya sudah habis. Mengembalikan id isi paket. */
  async function patientPackage(patientId: string, serviceId: string, nextVisitOn: string | null) {
    const catalog = await prisma.treatmentPackage.create({ data: { name: `${opts.prefix} Paket ${unique()}`, price: 500_000, validDays: 60 } });
    const purchase = await visit(patientId, addDaysToDateString(today, -30), [{ serviceId: null, name: "Paket Facial" }], { direct: true });
    const line = await prisma.invoiceLine.create({ data: { invoiceId: purchase.id, kind: "PAKET", name: "Paket Facial", quantity: 1, unitPrice: 500_000, treatmentPackageId: catalog.id, sortOrder: 9 } });
    const pkg = await prisma.patientPackage.create({
      data: {
        patientId, packageId: catalog.id, name: "Paket Facial", price: 500_000, purchaseLineId: line.id, startsOn: day(addDaysToDateString(today, -30)),
        expiresOn: day(addDaysToDateString(today, 30)), nextVisitOn: nextVisitOn ? day(nextVisitOn) : null,
        items: { create: [{ serviceId, serviceName: "Facial", sessions: 4 }] },
      },
      include: { items: true },
    });
    return pkg.items[0].id;
  }

  /** Sebelum cleanupBillingWorld: paket, sesi, dan tanda rangkap pasien uji. Sesudahnya: katalog paket uji. */
  async function cleanupBefore() {
    const patientIds = (await prisma.patient.findMany({ where: { whatsapp: { in: whatsapps } }, select: { id: true } })).map((row) => row.id);
    await prisma.packageSessionEntry.deleteMany({ where: { item: { patientPackage: { patientId: { in: patientIds } } } } });
    await prisma.invoiceLine.updateMany({ where: { invoice: { patientId: { in: patientIds } } }, data: { patientPackageItemId: null } });
    await prisma.patientPackage.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patient.updateMany({ where: { id: { in: patientIds } }, data: { mergedIntoId: null } });
  }
  async function cleanupAfter() {
    await prisma.treatmentPackage.deleteMany({ where: { name: { startsWith: `${opts.prefix} Paket` } } });
  }

  return { today, whatsapps, patient, visit, booking, patientPackage, cleanupBefore, cleanupAfter };
}

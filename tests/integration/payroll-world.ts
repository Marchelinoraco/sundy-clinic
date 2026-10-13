import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";

export type PayrollWorld = BillingWorld & { employeeId: string };
let seq = 0;

export async function createPayrollWorld(slug: string, whatsapp: string): Promise<PayrollWorld> {
  const world = await createBillingWorld(slug, whatsapp);
  const employee = await prisma.employee.create({
    data: { name: `${slug} Rina`, position: "Terapis", joinedOn: new Date("2026-01-01T00:00:00Z"), baseSalary: 3_000_000, allowance: 500_000, staffId: world.therapistId, branchId: world.branchId },
  });
  return { ...world, employeeId: employee.id };
}

/** Tagihan berisi satu baris treatment berkomisi untuk terapis dunia ini. */
export async function commissionInvoice(world: PayrollWorld, commission: number, status: "FINAL" | "DIBATALKAN" = "FINAL", finalizedAt = new Date()) {
  const invoice = await prisma.invoice.create({
    data: {
      patientId: world.patientId,
      branchId: world.branchId,
      createdById: "s",
      createdByName: "Uji",
      status,
      number: `TG-2098-${String(Date.now() % 100000).padStart(5, "0")}${++seq}`,
      finalizedAt,
      lines: {
        create: [{ kind: "TREATMENT", name: "Facial Uji", quantity: 1, unitPrice: 250_000, serviceId: world.treatmentId, commissionAmount: commission, performerId: world.therapistId, performerName: "Rina" }],
      },
    },
    select: { id: true, lines: { select: { id: true } } },
  });
  return { invoiceId: invoice.id, lineId: invoice.lines[0].id };
}

export async function cleanupPayrollWorld(slug: string, whatsapp: string, monthPrefix: string): Promise<void> {
  const employees = await prisma.employee.findMany({ where: { name: { startsWith: slug } }, select: { id: true } });
  const ids = employees.map((e) => e.id);
  // Penggajian bulan uji memuat semua karyawan yang bekerja di bulan itu, termasuk karyawan dari uji lain: bersihkan semuanya.
  const items = { OR: [{ employeeId: { in: ids } }, { period: { month: { startsWith: monthPrefix } } }] };
  await prisma.invoiceLine.updateMany({ where: { payrollItem: items }, data: { payrollItemId: null } });
  await prisma.payrollItem.deleteMany({ where: items });
  await prisma.payrollPeriod.deleteMany({ where: { month: { startsWith: monthPrefix } } });
  await prisma.expense.deleteMany({ where: { note: { contains: slug } } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  await cleanupBillingWorld(slug, [whatsapp]);
}

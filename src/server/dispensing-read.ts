import { prisma } from "@/lib/db";
import type { DispensingStatusValue, DispensingView } from "@/lib/dispensing";
import { stockFlags } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

export type DispensingRow = {
  id: string;
  status: DispensingStatusValue;
  patientName: string;
  branchName: string;
  startAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  lineCount: number;
};

/** Antrean penyerahan (spec penyerahan 6): Menunggu terlama di atas; lainnya terbaru di atas; paling banyak 300. */
export async function listDispensings(filter: { view: DispensingView; q?: string }): Promise<DispensingRow[]> {
  await requireCapability("dispense:read");
  const q = filter.q?.trim();
  const rows = await prisma.dispensing.findMany({
    where: {
      status: filter.view,
      ...(q
        ? {
            appointment: {
              patient: {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { medicalRecordNumber: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          }
        : {}),
    },
    orderBy: filter.view === "MENUNGGU" ? { createdAt: "asc" } : { completedAt: "desc" },
    take: 300,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      branch: { select: { name: true } },
      appointment: { select: { startAt: true, patient: { select: { name: true } } } },
      _count: { select: { lines: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    patientName: row.appointment.patient?.name ?? "-",
    branchName: row.branch.name,
    startAt: row.appointment.startAt,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    lineCount: row._count.lines,
  }));
}

/** Jumlah penyerahan Menunggu, untuk lencana menu dan kotak dasbor. */
export async function countPendingDispensings(): Promise<number> {
  await requireCapability("dispense:read");
  return prisma.dispensing.count({ where: { status: "MENUNGGU" } });
}

export type DispensingDetail = {
  id: string;
  version: number;
  status: DispensingStatusValue;
  appointmentId: string;
  branchId: string;
  branchName: string;
  startAt: Date;
  patientName: string;
  /** Catatan untuk Apoteker: satu-satunya isi klinis yang dibuka untuk Apoteker. */
  note: string;
  completedAt: Date | null;
  completedByName: string | null;
  lines: { id: string; itemId: string; itemName: string; quantity: number; usage: string }[];
  /** Status tagihan aktif kunjungan ini; NONE bila belum ada. */
  invoiceState: "NONE" | "DRAF" | "FINAL";
  /** Boleh dibuka kembali: sudah diproses dan tagihan belum final (spec penyerahan 4.5). */
  canReopen: boolean;
};

/** Rincian satu penyerahan. Sengaja tidak memilih kolom klinis selain pharmacyNote. */
export async function getDispensingDetail(id: string): Promise<DispensingDetail | null> {
  await requireCapability("dispense:read");
  const row = await prisma.dispensing.findUnique({
    where: { id: String(id ?? "") },
    select: {
      id: true,
      version: true,
      status: true,
      appointmentId: true,
      branchId: true,
      completedAt: true,
      completedByName: true,
      branch: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { id: true, itemId: true, itemName: true, quantity: true, usage: true } },
      appointment: {
        select: {
          startAt: true,
          patient: { select: { name: true } },
          encounter: { select: { pharmacyNote: true } },
          invoices: { where: { status: { not: "DIBATALKAN" } }, select: { status: true } },
        },
      },
    },
  });
  if (!row) return null;
  const invoiceStatus = row.appointment.invoices[0]?.status;
  const invoiceState = invoiceStatus === "FINAL" ? "FINAL" : invoiceStatus === "DRAF" ? "DRAF" : "NONE";
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    appointmentId: row.appointmentId,
    branchId: row.branchId,
    branchName: row.branch.name,
    startAt: row.appointment.startAt,
    patientName: row.appointment.patient?.name ?? "-",
    note: row.appointment.encounter?.pharmacyNote ?? "",
    completedAt: row.completedAt,
    completedByName: row.completedByName,
    lines: row.lines,
    invoiceState,
    canReopen: row.status !== "MENUNGGU" && invoiceState !== "FINAL",
  };
}

export type DispenseItem = { id: string; code: string; name: string; unit: string; available: number };

/** Pilihan obat untuk Apoteker: aktif, berharga jual, dengan stok tersedia di cabang. Tanpa harga dan tanpa batch. */
export async function listDispenseItems(branchId: string): Promise<DispenseItem[]> {
  await requireCapability("dispense:manage");
  const today = witaDateString(new Date());
  const items = await prisma.stockItem.findMany({
    where: { isActive: true, sellPrice: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      batches: {
        where: { branchId: String(branchId ?? ""), quantityRemaining: { gt: 0 } },
        select: { quantityRemaining: true, expiryDate: true, unitCost: true },
      },
    },
  });
  return items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    available: stockFlags(item.batches, 0, today).available,
  }));
}

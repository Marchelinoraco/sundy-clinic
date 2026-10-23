import { prisma } from "@/lib/db";
import { PAYMENT_METHOD_LABEL, dateOnlyString } from "@/lib/stock";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { activeCredits } from "@/server/deposit-store";
import { requireCapability } from "@/server/session";

// Menu Deposit dan saldo di halaman pasien (spec deposit D10, D18). Modul baca biasa; hak dicek di sini.

/** Rentang satu halaman Riwayat. */
const HISTORY_DAYS = 90;
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const SOURCE_LABEL = { KELEBIHAN_BAYAR: "Kelebihan bayar", SISA_DEPOSIT_BOOKING: "Sisa deposit booking" } as const;

export type DepositBalanceRow = { patientId: string; patientName: string; medicalRecordNumber: string; balance: number; nearestValidUntil: string };
export type PatientDeposit = { balance: number; nearestValidUntil: string; credits: { remaining: number; validUntil: string }[] };

export type DepositMovementKind = "MASUK" | "DIPAKAI" | "DIKEMBALIKAN" | "HANGUS";
export type DepositMovement = {
  id: string;
  /** YYYY-MM-DD (WITA). */
  date: string;
  kind: DepositMovementKind;
  /** Asal atau bentuknya: "Deposit booking", "Kelebihan bayar", "Sisa deposit booking", "Saldo deposit", "Tunai", "Transfer bank". */
  label: string;
  patientId: string;
  patientName: string;
  medicalRecordNumber: string;
  amount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  staffName: string | null;
  approvedByName: string | null;
  /** Alasan pengembalian. */
  note: string | null;
};
export type DepositHistory = { from: string; to: string; olderBefore: string; rows: DepositMovement[] };

const PATIENT_SELECT = { select: { id: true, name: true, medicalRecordNumber: true } } as const;
const ofPatient = (patient: { id: string; name: string; medicalRecordNumber: string }) => ({
  patientId: patient.id,
  patientName: patient.name,
  medicalRecordNumber: patient.medicalRecordNumber,
});

/** Tab Aktif (D18): pasien yang punya saldo masih berlaku, kedaluwarsa terdekat lebih dulu. */
export async function listDepositBalances(): Promise<DepositBalanceRow[]> {
  await requireCapability("invoice:read");
  const today = witaDateString(new Date());
  const credits = await prisma.depositCredit.findMany({
    where: { validUntil: { gte: day(today) } },
    select: {
      amount: true,
      validUntil: true,
      patient: PATIENT_SELECT,
      uses: { select: { amount: true } },
      refundParts: { select: { amount: true } },
    },
  });
  const byPatient = new Map<string, DepositBalanceRow>();
  for (const credit of credits) {
    const remaining = credit.amount - credit.uses.reduce((sum, use) => sum + use.amount, 0) - credit.refundParts.reduce((sum, part) => sum + part.amount, 0);
    if (remaining <= 0) continue;
    const validUntil = dateOnlyString(credit.validUntil);
    const row = byPatient.get(credit.patient.id) ?? { ...ofPatient(credit.patient), balance: 0, nearestValidUntil: validUntil };
    row.balance += remaining;
    if (validUntil < row.nearestValidUntil) row.nearestValidUntil = validUntil;
    byPatient.set(credit.patient.id, row);
  }
  return [...byPatient.values()].sort((a, b) => a.nearestValidUntil.localeCompare(b.nearestValidUntil) || a.patientName.localeCompare(b.patientName));
}

/** Saldo deposit satu pasien (D10); null bila tidak ada yang masih berlaku. */
export async function getPatientDeposit(patientId: string): Promise<PatientDeposit | null> {
  await requireCapability("invoice:read");
  const credits = await activeCredits(prisma, String(patientId ?? ""), witaDateString(new Date()));
  if (credits.length === 0) return null;
  return {
    balance: credits.reduce((sum, credit) => sum + credit.remaining, 0),
    nearestValidUntil: credits[0].validUntil,
    credits: credits.map((credit) => ({ remaining: credit.remaining, validUntil: credit.validUntil })),
  };
}

/**
 * Tab Riwayat (D18): gerakan 90 hari sampai sehari sebelum `before` (bawaan: sampai hari ini), terbaru dulu.
 * - Masuk: biaya booking saat pertama diverifikasi, kelebihan bayar, dan sisa deposit booking.
 * - Dipakai: potongan di tagihan final. Dikembalikan: pengembalian uang.
 * - Hangus: saldo yang lewat masa berlakunya dan masih bersisa (sehari sesudah "berlaku s.d."), dan deposit booking
 *   yang bookingnya dibatalkan atau tidak hadir (D2), pada tanggal booking itu terakhir diubah.
 */
export async function listDepositHistory(filter: { before?: string }): Promise<DepositHistory> {
  await requireCapability("invoice:read");
  const today = witaDateString(new Date());
  const to = filter.before && /^\d{4}-\d{2}-\d{2}$/.test(filter.before) && filter.before <= today ? addDaysToDateString(filter.before, -1) : today;
  const from = addDaysToDateString(to, -(HISTORY_DAYS - 1));
  const start = combineWitaDateAndMinutes(from, 0);
  const end = combineWitaDateAndMinutes(addDaysToDateString(to, 1), 0);
  const dates = { gte: day(from), lte: day(to) };
  // Hangus sehari sesudah "berlaku s.d."; `to` tidak pernah sesudah hari ini.
  const lastExpired = addDaysToDateString(to, -1);

  const [credits, expired, uses, refunds, verifies, forfeited] = await Promise.all([
    prisma.depositCredit.findMany({
      where: { recordedOn: dates },
      select: { id: true, amount: true, source: true, recordedOn: true, staffName: true, patient: PATIENT_SELECT, sourceInvoice: { select: { id: true, number: true } } },
    }),
    prisma.depositCredit.findMany({
      where: { validUntil: { gte: day(addDaysToDateString(from, -1)), lte: day(lastExpired) } },
      select: {
        id: true,
        amount: true,
        source: true,
        validUntil: true,
        patient: PATIENT_SELECT,
        sourceInvoice: { select: { id: true, number: true } },
        uses: { select: { amount: true } },
        refundParts: { select: { amount: true } },
      },
    }),
    prisma.depositUse.findMany({
      where: { invoice: { status: "FINAL", finalizedAt: { gte: start, lt: end } } },
      select: { id: true, kind: true, amount: true, invoice: { select: { id: true, number: true, finalizedAt: true, finalizedByName: true, patient: PATIENT_SELECT } } },
    }),
    prisma.depositRefund.findMany({
      where: { refundedOn: dates },
      select: { id: true, amount: true, method: true, reason: true, refundedOn: true, staffName: true, approvedByName: true, patient: PATIENT_SELECT },
    }),
    bookingVerifications(start, end),
    prisma.appointment.findMany({
      where: {
        status: { in: ["DIBATALKAN", "TIDAK_HADIR"] },
        bookingFee: { gt: 0 },
        updatedAt: { gte: start, lt: end },
        patientId: { not: null },
        depositUses: { none: {} },
      },
      select: { id: true, bookingFee: true, updatedAt: true, patient: PATIENT_SELECT },
    }),
  ]);

  const rows: DepositMovement[] = [];
  const base = { invoiceId: null, invoiceNumber: null, staffName: null, approvedByName: null, note: null };
  for (const credit of credits) {
    rows.push({
      ...base,
      id: `masuk-${credit.id}`,
      date: dateOnlyString(credit.recordedOn),
      kind: "MASUK",
      label: SOURCE_LABEL[credit.source],
      ...ofPatient(credit.patient),
      amount: credit.amount,
      invoiceId: credit.sourceInvoice?.id ?? null,
      invoiceNumber: credit.sourceInvoice?.number ?? null,
      staffName: credit.staffName,
    });
  }
  for (const verify of verifies) {
    rows.push({ ...base, id: `booking-${verify.appointmentId}`, date: witaDateString(verify.at), kind: "MASUK", label: "Deposit booking", ...ofPatient(verify.patient), amount: verify.fee, staffName: verify.actorName });
  }
  for (const use of uses) {
    rows.push({
      ...base,
      id: `pakai-${use.id}`,
      date: witaDateString(use.invoice.finalizedAt as Date),
      kind: "DIPAKAI",
      label: use.kind === "BOOKING" ? "Deposit booking" : "Saldo deposit",
      ...ofPatient(use.invoice.patient),
      amount: use.amount,
      invoiceId: use.invoice.id,
      invoiceNumber: use.invoice.number,
      staffName: use.invoice.finalizedByName,
    });
  }
  for (const refund of refunds) {
    rows.push({
      ...base,
      id: `kembali-${refund.id}`,
      date: dateOnlyString(refund.refundedOn),
      kind: "DIKEMBALIKAN",
      label: PAYMENT_METHOD_LABEL[refund.method],
      ...ofPatient(refund.patient),
      amount: refund.amount,
      staffName: refund.staffName,
      approvedByName: refund.approvedByName,
      note: refund.reason,
    });
  }
  for (const credit of expired) {
    const remaining = credit.amount - credit.uses.reduce((sum, use) => sum + use.amount, 0) - credit.refundParts.reduce((sum, part) => sum + part.amount, 0);
    if (remaining <= 0) continue;
    rows.push({
      ...base,
      id: `hangus-${credit.id}`,
      date: addDaysToDateString(dateOnlyString(credit.validUntil), 1),
      kind: "HANGUS",
      label: SOURCE_LABEL[credit.source],
      ...ofPatient(credit.patient),
      amount: remaining,
      invoiceId: credit.sourceInvoice?.id ?? null,
      invoiceNumber: credit.sourceInvoice?.number ?? null,
    });
  }
  const verifiedIds = await verifiedAppointmentIds(forfeited.map((appointment) => appointment.id));
  for (const appointment of forfeited) {
    if (!appointment.patient || !verifiedIds.has(appointment.id)) continue;
    rows.push({
      ...base,
      id: `hangus-booking-${appointment.id}`,
      date: witaDateString(appointment.updatedAt),
      kind: "HANGUS",
      label: "Deposit booking",
      ...ofPatient(appointment.patient),
      amount: appointment.bookingFee ?? 0,
    });
  }

  const KIND_ORDER: Record<DepositMovementKind, number> = { HANGUS: 0, DIKEMBALIKAN: 1, DIPAKAI: 2, MASUK: 3 };
  rows.sort((a, b) => b.date.localeCompare(a.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.patientName.localeCompare(b.patientName));
  return { from, to, olderBefore: from, rows };
}

/** Booking berbiaya yang PERTAMA kali diverifikasi di [start, end): deposit booking masuk (D1, D3), sama dengan laporan. */
async function bookingVerifications(start: Date, end: Date) {
  const inRange = await prisma.auditLog.findMany({
    where: { action: "appointment.verify", entity: "Appointment", createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, createdAt: true, actorName: true },
  });
  if (inRange.length === 0) return [];
  const earliest = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: { action: "appointment.verify", entity: "Appointment", entityId: { in: [...new Set(inRange.map((row) => row.entityId))] } },
    _min: { createdAt: true },
  });
  const firstAt = new Map(earliest.map((row) => [row.entityId, row._min.createdAt]));
  const first = inRange.filter((row) => firstAt.get(row.entityId)?.getTime() === row.createdAt.getTime());
  const appointments = await prisma.appointment.findMany({
    where: { id: { in: first.map((row) => row.entityId) }, bookingFee: { gt: 0 }, patientId: { not: null } },
    select: { id: true, bookingFee: true, patient: PATIENT_SELECT },
  });
  const byId = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  return first.flatMap((row) => {
    const appointment = byId.get(row.entityId);
    if (!appointment?.patient) return [];
    return [{ appointmentId: appointment.id, at: row.createdAt, actorName: row.actorName, fee: appointment.bookingFee ?? 0, patient: appointment.patient }];
  });
}

async function verifiedAppointmentIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.auditLog.findMany({
    where: { action: "appointment.verify", entity: "Appointment", entityId: { in: ids } },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  return new Set(rows.map((row) => row.entityId));
}

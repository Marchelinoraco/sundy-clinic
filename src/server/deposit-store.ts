import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import { allocateCredits, depositValidUntil } from "@/lib/deposit";
import { dateOnlyString } from "@/lib/stock";

// Deposit booking dan saldo deposit pasien di tagihan (spec deposit D1–D8, D12). Modul server biasa: dipakai di dalam
// transaksi aksi tagihan.

type Db = Prisma.TransactionClient;
type Actor = { staffId: string; name: string };
const day = (value: string) => new Date(`${value}T00:00:00Z`);

/** Satu alokasi saldo per pasien pada satu waktu: dua tagihan atau pengembalian tidak memakai saldo yang sama. */
export async function lockPatient(tx: Db, patientId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`;
}

/** Biaya booking yang menjadi deposit: hanya bila > 0 dan transfernya pernah diverifikasi (D1, D3). */
export async function bookingDepositFor(db: Db, appointmentId: string | null): Promise<number> {
  if (!appointmentId) return 0;
  const appointment = await db.appointment.findUnique({ where: { id: appointmentId }, select: { bookingFee: true } });
  const fee = appointment?.bookingFee ?? 0;
  if (fee <= 0) return 0;
  const verified = await db.auditLog.count({ where: { action: "appointment.verify", entity: "Appointment", entityId: appointmentId } });
  return verified > 0 ? fee : 0;
}

/** Saldo pasien yang masih berlaku dan bersisa, kedaluwarsa paling dulu lebih dulu (D6, D7). */
export async function activeCredits(db: Db, patientId: string, today: string): Promise<{ id: string; remaining: number; validUntil: string }[]> {
  const credits = await db.depositCredit.findMany({
    where: { patientId, validUntil: { gte: day(today) } },
    orderBy: [{ validUntil: "asc" }, { createdAt: "asc" }],
    select: { id: true, amount: true, validUntil: true, uses: { select: { amount: true } }, refundParts: { select: { amount: true } } },
  });
  return credits
    .map((credit) => ({
      id: credit.id,
      remaining:
        credit.amount -
        credit.uses.reduce((sum, use) => sum + use.amount, 0) -
        credit.refundParts.reduce((sum, part) => sum + part.amount, 0),
      validUntil: dateOnlyString(credit.validUntil),
    }))
    .filter((credit) => credit.remaining > 0);
}

/**
 * Potongan saat tagihan difinalkan (D1, D4, D6, D8): deposit booking lebih dulu, sisa fee menjadi saldo pasien 30 hari,
 * lalu saldo pasien yang masih berlaku sampai sisa tagihan 0. Pemanggil sudah mengunci pasien.
 */
export async function applyDeposits(
  tx: Db,
  invoice: { id: string; patientId: string; appointmentId: string | null; total: number },
  actor: Actor,
  today: string,
): Promise<void> {
  let left = invoice.total;
  const fee = await bookingDepositFor(tx, invoice.appointmentId);
  if (fee > 0 && invoice.appointmentId) {
    const used = Math.min(fee, Math.max(0, left));
    if (used > 0) await tx.depositUse.create({ data: { invoiceId: invoice.id, kind: "BOOKING", appointmentId: invoice.appointmentId, amount: used } });
    left -= used;
    if (fee > used) {
      await tx.depositCredit.create({
        data: {
          patientId: invoice.patientId,
          amount: fee - used,
          source: "SISA_DEPOSIT_BOOKING",
          sourceInvoiceId: invoice.id,
          recordedOn: day(today),
          validUntil: day(depositValidUntil(today)),
          staffId: actor.staffId,
          staffName: actor.name,
        },
      });
    }
  }
  if (left <= 0) return;
  for (const part of allocateCredits(await activeCredits(tx, invoice.patientId, today), left, today)) {
    await tx.depositUse.create({ data: { invoiceId: invoice.id, kind: "SALDO", creditId: part.creditId, amount: part.amount } });
  }
}

/**
 * Tagihan final dibatalkan (D12): pemakaian depositnya dihapus (saldo kembali dengan tanggal berlaku asli), lalu saldo
 * yang lahir dari tagihan ini ikut dihapus. Ditolak bila saldo itu sudah dipakai tagihan lain atau dikembalikan.
 * Pemanggil sudah mengunci pasien.
 */
export async function releaseDeposits(tx: Db, invoiceId: string): Promise<void> {
  const credits = await tx.depositCredit.findMany({
    where: { sourceInvoiceId: invoiceId },
    select: { id: true, uses: { select: { invoice: { select: { number: true } } } }, refundParts: { select: { id: true } } },
  });
  for (const credit of credits) {
    const user = credit.uses[0];
    if (user) throw new UserFacingError(`Deposit dari tagihan ini sudah dipakai di ${user.invoice.number ?? "tagihan lain"}. Batalkan tagihan itu dulu.`);
    if (credit.refundParts.length > 0) throw new UserFacingError("Deposit dari tagihan ini sudah dikembalikan ke pasien.");
  }
  await tx.depositUse.deleteMany({ where: { invoiceId } });
  if (credits.length > 0) await tx.depositCredit.deleteMany({ where: { id: { in: credits.map((credit) => credit.id) } } });
}

/** Kelebihan bayar non-tunai menjadi saldo pasien, berlaku 30 hari dari tanggal bayar (D5). Pemanggil sudah mengunci pasien. */
export async function recordOverpayment(
  tx: Db,
  overpay: { patientId: string; invoiceId: string; paymentId: string; amount: number; paidAt: string },
  actor: Actor,
): Promise<{ id: string; validUntil: string }> {
  const validUntil = depositValidUntil(overpay.paidAt);
  const credit = await tx.depositCredit.create({
    data: {
      patientId: overpay.patientId,
      amount: overpay.amount,
      source: "KELEBIHAN_BAYAR",
      sourceInvoiceId: overpay.invoiceId,
      sourcePaymentId: overpay.paymentId,
      recordedOn: day(overpay.paidAt),
      validUntil: day(validUntil),
      staffId: actor.staffId,
      staffName: actor.name,
    },
    select: { id: true },
  });
  return { id: credit.id, validUntil };
}

/**
 * Pembayaran berlebih dibatalkan: saldonya ikut hilang. Ditolak bila saldo itu sudah dipakai tagihan lain atau
 * dikembalikan (Review Focus 4). Mengunci pasien sendiri; pemanggil sudah mengunci tagihan.
 */
export async function releaseOverpayment(tx: Db, paymentId: string): Promise<void> {
  const found = await tx.depositCredit.findUnique({ where: { sourcePaymentId: paymentId }, select: { id: true, patientId: true } });
  if (!found) return;
  await lockPatient(tx, found.patientId);
  const credit = await tx.depositCredit.findUniqueOrThrow({
    where: { id: found.id },
    select: { uses: { select: { invoice: { select: { number: true } } } }, refundParts: { select: { id: true } } },
  });
  const user = credit.uses[0];
  if (user) throw new UserFacingError(`Kelebihan pembayaran ini sudah dipakai di ${user.invoice.number ?? "tagihan lain"}.`);
  if (credit.refundParts.length > 0) throw new UserFacingError("Kelebihan pembayaran ini sudah dikembalikan ke pasien.");
  await tx.depositCredit.delete({ where: { id: found.id } });
}

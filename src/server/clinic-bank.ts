"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { validateClinicBankAccount, type ClinicBankAccountInput } from "@/lib/clinic-bank";
import { prisma } from "@/lib/db";
import { formatBankAccount } from "@/lib/payment";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

export type ClinicBankAccountView = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isActive: boolean;
  sortOrder: number;
  label: string;
};

const SELECT = { id: true, bankName: true, accountNumber: true, accountHolder: true, isActive: true, sortOrder: true } as const;
type Row = { id: string; bankName: string; accountNumber: string; accountHolder: string; isActive: boolean; sortOrder: number };

const view = (row: Row): ClinicBankAccountView => ({
  ...row,
  label: formatBankAccount({ bankName: row.bankName, bankAccountNumber: row.accountNumber, bankAccountHolder: row.accountHolder })!,
});
const ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

function revalidate() {
  safeRevalidatePath("/admin/pengaturan");
  safeRevalidatePath("/admin/tagihan");
}

async function assertUnique(input: ClinicBankAccountInput, exceptId?: string) {
  const twin = await prisma.clinicBankAccount.findFirst({
    where: { isActive: true, bankName: { equals: input.bankName, mode: "insensitive" }, accountNumber: input.accountNumber, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (twin) throw new UserFacingError("Rekening ini sudah ada.");
}

export async function listClinicBankAccounts(): Promise<ClinicBankAccountView[]> {
  await requireCapability("content:manage");
  return (await prisma.clinicBankAccount.findMany({ orderBy: ORDER, select: SELECT })).map(view);
}

/** Pilihan rekening tujuan di dialog pembayaran transfer. */
export async function listActiveClinicBankAccounts(): Promise<ClinicBankAccountView[]> {
  await requireCapability("invoice:read");
  return (await prisma.clinicBankAccount.findMany({ where: { isActive: true }, orderBy: ORDER, select: SELECT })).map(view);
}

export async function createClinicBankAccount(input: ClinicBankAccountInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    const checked = validateClinicBankAccount(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    await assertUnique(checked.value);
    const last = await prisma.clinicBankAccount.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.clinicBankAccount.create({ data: { ...checked.value, sortOrder: (last._max.sortOrder ?? -1) + 1 }, select: SELECT });
    await recordAudit({ actor, action: "clinic-bank.create", entity: "ClinicBankAccount", entityId: created.id, summary: view(created).label });
    revalidate();
    return { id: created.id };
  });
}

export async function updateClinicBankAccount(id: string, input: ClinicBankAccountInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    const checked = validateClinicBankAccount(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const existing = await prisma.clinicBankAccount.findUnique({ where: { id: String(id ?? "") }, select: { id: true } });
    if (!existing) throw new UserFacingError("Rekening tidak ditemukan.");
    await assertUnique(checked.value, existing.id);
    const updated = await prisma.clinicBankAccount.update({ where: { id: existing.id }, data: checked.value, select: SELECT });
    await recordAudit({ actor, action: "clinic-bank.update", entity: "ClinicBankAccount", entityId: updated.id, summary: view(updated).label });
    revalidate();
  });
}

export async function setClinicBankAccountActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("content:manage");
    const existing = await prisma.clinicBankAccount.findUnique({ where: { id: String(id ?? "") }, select: SELECT });
    if (!existing) throw new UserFacingError("Rekening tidak ditemukan.");
    if (active) await assertUnique(existing, existing.id);
    await prisma.clinicBankAccount.update({ where: { id: existing.id }, data: { isActive: active === true } });
    await recordAudit({ actor, action: active ? "clinic-bank.activate" : "clinic-bank.deactivate", entity: "ClinicBankAccount", entityId: existing.id, summary: view(existing).label });
    revalidate();
  });
}

export async function moveClinicBankAccount(id: string, direction: "UP" | "DOWN"): Promise<ActionResult<void>> {
  return runAction(async () => {
    await requireCapability("content:manage");
    const rows = await prisma.clinicBankAccount.findMany({ orderBy: ORDER, select: { id: true } });
    const index = rows.findIndex((row) => row.id === id);
    const target = direction === "UP" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    await prisma.$transaction(rows.map((row, order) => prisma.clinicBankAccount.update({ where: { id: row.id }, data: { sortOrder: order } })));
    revalidate();
  });
}

"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { validateLegacyPackage, type LegacyPackageForm } from "@/lib/legacy-package";
import { firstLegacyPatientError, nikTakenMessage, validateLegacyPatient, type LegacyPatientInput } from "@/lib/patient-registration";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateLabel } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { NO_EXPIRY_DATE, packageContentsLabel } from "@/lib/treatment-package";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { CATALOG_ITEM_SELECT, catalogItemsData, remainingByItem } from "@/server/package-store";
import { insertPatient } from "@/server/patient-store";
import { requireCapability } from "@/server/session";

// Paket lama dari Kluto (spec docs/superpowers/specs/2026-11-11-paket-lama-kluto-design.md): diketik Resepsionis/Super Admin,
// langsung aktif tanpa PIN (PL3), tanpa tagihan dan tanpa batas waktu (PL6, PL7).

type Db = Prisma.TransactionClient;
const day = (value: string) => new Date(`${value}T00:00:00Z`);

export type LegacyDuplicate = { patientPackageId: string; enteredOn: string; staffName: string; remainingLabel: string };
export type CreateLegacyPackageInput = { patient: { id: string } | { new: LegacyPatientInput }; form: LegacyPackageForm };

/** "1× Facial, 7 botol Serum" dari sisa per isi; isi yang habis tidak ditulis. */
function remainingLabel(items: readonly { id: string; serviceName: string; unit: string | null }[], remaining: Map<string, number>): string {
  return packageContentsLabel(
    items.map((item) => ({ name: item.serviceName, unit: item.unit, sessions: remaining.get(item.id) ?? 0 })).filter((item) => item.sessions > 0),
  );
}

/** Paket lama aktif milik pasien dari paket katalog yang sama (PL10). */
async function legacyDuplicates(db: Db, patientId: string, packageId: string): Promise<LegacyDuplicate[]> {
  const rows = await db.patientPackage.findMany({
    where: { patientId, packageId, source: "KLUTO", status: "AKTIF" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, serviceName: true, unit: true, entries: { where: { kind: "BELI" }, take: 1, select: { staffName: true } } },
      },
    },
  });
  const remaining = await remainingByItem(db, rows.flatMap((row) => row.items.map((item) => item.id)));
  return rows.map((row) => ({
    patientPackageId: row.id,
    enteredOn: witaDateString(row.createdAt),
    staffName: row.items[0]?.entries[0]?.staffName ?? "",
    remainingLabel: remainingLabel(row.items, remaining) || "habis",
  }));
}

/** Peringatan paket ganda saat dialog memilih pasien dan paket. */
export async function findLegacyDuplicates(input: { patientId: string; packageId: string }): Promise<ActionResult<LegacyDuplicate[]>> {
  return runAction(async () => {
    await requireCapability("invoice:manage");
    return prisma.$transaction((tx) => legacyDuplicates(tx, String(input?.patientId ?? ""), String(input?.packageId ?? "")));
  });
}

/**
 * Menyimpan paket lama (spec bagian 4): pasien yang ada atau pasien baru (nama + WA wajib, PL9) dan paketnya dalam satu
 * transaksi, sehingga dialog yang gagal tidak meninggalkan pasien kosong. Buku: BELI +jatah, lalu PAKAI_KLUTO −sudah dipakai.
 */
export async function createLegacyPackage(
  input: CreateLegacyPackageInput,
): Promise<ActionResult<{ patientPackageId: string; patientId: string; summary: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const today = witaDateString(new Date());
    const target = input?.patient;
    const fresh = target && "new" in target ? target.new : null;
    let newPatient: ReturnType<typeof validateLegacyPatient> | null = null;
    if (fresh) {
      await requireCapability("booking:manage");
      newPatient = validateLegacyPatient((fresh ?? {}) as Record<string, unknown>, today);
      if (!newPatient.ok) throw new UserFacingError(firstLegacyPatientError(newPatient.errors));
      if (newPatient.value.nik) {
        const owner = await prisma.patient.findFirst({ where: { nik: newPatient.value.nik }, select: { name: true, medicalRecordNumber: true } });
        if (owner) throw new UserFacingError(nikTakenMessage(owner));
      }
    } else if (!target || !("id" in target) || typeof target.id !== "string" || !target.id) {
      throw new UserFacingError("Pilih pasien.");
    }

    const form = input?.form;
    let saved;
    try {
      saved = await prisma.$transaction(async (tx) => {
        const patient =
          newPatient?.ok === true
            ? await insertPatient(tx, newPatient.value)
            : await tx.patient.findFirst({ where: { id: (target as { id: string }).id, mergedIntoId: null } });
        if (!patient) throw new UserFacingError("Pilih pasien.");

        const packageId = typeof form?.packageId === "string" ? form.packageId : "";
        const pkg = packageId
          ? await tx.treatmentPackage.findUnique({
              where: { id: packageId },
              select: { id: true, name: true, visitIntervalDays: true, items: { orderBy: { sortOrder: "asc" }, select: CATALOG_ITEM_SELECT } },
            })
          : null;
        if (!pkg) throw new UserFacingError("Pilih paket.");
        // Isi katalog bisa diubah Admin Keuangan selama dialog terbuka: id isi yang berbeda tidak ditebak (Review Focus 3).
        const used = form?.used && typeof form.used === "object" ? Object.keys(form.used) : [];
        if (used.length !== pkg.items.length || pkg.items.some((item) => !used.includes(item.id))) {
          throw new UserFacingError("Isi paket ini berubah. Muat ulang halaman lalu coba lagi.");
        }
        const names = pkg.items.map((item) => ({ id: item.id, name: item.service?.name ?? item.item?.name ?? "", sessions: item.sessions }));
        const checked = validateLegacyPackage(form, { today, items: names });
        if (!checked.ok) throw new UserFacingError(checked.message);

        if (form.confirmDuplicate !== true && (await legacyDuplicates(tx, patient.id, pkg.id)).length > 0) {
          throw new UserFacingError(`Pasien ini sudah punya paket lama ${pkg.name}. Centang “Ini paket yang berbeda” bila memang dibeli dua kali.`);
        }

        const created = await tx.patientPackage.create({
          data: {
            patientId: patient.id,
            packageId: pkg.id,
            name: pkg.name,
            price: 0,
            source: "KLUTO",
            startsOn: day(checked.value.boughtOn),
            expiresOn: day(NO_EXPIRY_DATE),
            visitIntervalDays: pkg.visitIntervalDays,
            nextVisitOn: checked.value.nextVisitOn ? day(checked.value.nextVisitOn) : null,
            priorVisits: checked.value.priorVisits,
            note: checked.value.note,
            items: { create: catalogItemsData(pkg.items) },
          },
          select: { id: true, items: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceName: true, unit: true, sessions: true } } },
        });
        const staff = { staffId: actor.staffId, staffName: actor.name };
        const usedByIndex = checked.value.used.map((row) => row.used);
        await tx.packageSessionEntry.createMany({
          data: created.items.flatMap((item, index) => [
            { patientPackageItemId: item.id, kind: "BELI" as const, delta: item.sessions, ...staff },
            ...(usedByIndex[index] > 0 ? [{ patientPackageItemId: item.id, kind: "PAKAI_KLUTO" as const, delta: -usedByIndex[index], ...staff }] : []),
          ]),
        });
        const remaining = new Map(created.items.map((item, index) => [item.id, item.sessions - usedByIndex[index]]));
        return { patient, pkg, created, isNew: newPatient !== null, boughtOn: checked.value.boughtOn, contents: remainingLabel(created.items, remaining) };
      });
    } catch (error) {
      // Dua pendaftar bersamaan dengan NIK sama: indeks unik menolak yang kedua (seperti createPatient).
      if (isUniqueViolation(error) && newPatient?.ok && newPatient.value.nik) {
        const owner = await prisma.patient.findFirst({ where: { nik: newPatient.value.nik }, select: { name: true, medicalRecordNumber: true } });
        if (owner) throw new UserFacingError(nikTakenMessage(owner));
      }
      throw error;
    }

    const { patient, pkg, created, contents } = saved;
    if (saved.isNew) {
      await recordAudit({ actor, action: "patient.create", entity: "Patient", entityId: patient.id, summary: `${patient.name} (${patient.medicalRecordNumber})` });
    }
    await recordAudit({
      actor,
      action: "patient-package.legacy-create",
      entity: "PatientPackage",
      entityId: created.id,
      summary: `${patient.medicalRecordNumber} · ${pkg.name} · beli ${dateLabel(saved.boughtOn)} · sisa ${contents}`,
    });
    safeRevalidatePath("/admin/paket");
    safeRevalidatePath(`/admin/pasien/${patient.id}`);
    if (saved.isNew) safeRevalidatePath("/admin/pasien");
    return { patientPackageId: created.id, patientId: patient.id, summary: `Paket ${pkg.name} untuk ${patient.name} (${patient.medicalRecordNumber}): sisa ${contents}` };
  });
}

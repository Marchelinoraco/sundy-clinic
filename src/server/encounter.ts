"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  ENCOUNTER_TEXT_MAX,
  FINALIZE_NEEDS_ASSESSMENT,
  encounterDraftInputSchema,
  parseEncounterDraft,
  type EncounterDraft,
  type EncounterDraftInput,
} from "@/lib/encounter";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit, recordAuditThrottled } from "@/server/audit";
import { isRecordLockedError, isUniqueViolation } from "@/server/db-errors";
import { lastHeightCm } from "@/server/encounter-store";
import { requireCapability } from "@/server/session";

const STALE = "Catatan ini baru diubah di tempat lain. Muat ulang halaman.";
const LOCKED = "Catatan ini sudah difinalisasi. Muat ulang halaman.";
const GONE = "Kunjungan ini sudah tidak ada (drafnya dibuang). Muat ulang halaman.";

type Db = Prisma.TransactionClient | typeof prisma;

type TreatmentRow = {
  serviceId: string;
  serviceName: string;
  area: string | null;
  dose: string | null;
  performerId: string;
  performerName: string;
  notes: string | null;
};

function readDraft(input: unknown): EncounterDraft {
  const shape = encounterDraftInputSchema.safeParse(input);
  if (!shape.success) throw new UserFacingError("Isian tidak sah. Muat ulang halaman lalu coba lagi.");
  const parsed = parseEncounterDraft(shape.data);
  if (!parsed.ok) throw new UserFacingError(parsed.message);
  return parsed.value;
}

function readVersion(value: unknown): Date {
  const version = new Date(String(value ?? ""));
  if (Number.isNaN(version.getTime())) throw new UserFacingError("Muat ulang halaman lalu coba lagi.");
  return version;
}

/** Alasan pembaruan bersyarat tidak mengenai baris mana pun. */
async function whyUnchanged(db: Db, encounterId: string): Promise<string> {
  const row = await db.encounter.findUnique({ where: { id: encounterId }, select: { status: true } });
  if (!row) return GONE;
  return row.status === "FINAL" ? LOCKED : STALE;
}

/** Trigger basis data adalah jaring terakhir; pesannya tidak boleh sampai ke layar mentah. */
async function guardLocked<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isRecordLockedError(error)) throw new UserFacingError(LOCKED);
    throw error;
  }
}

/**
 * Nama layanan dan pelaksana dibaca dari basis data, bukan dari browser, lalu
 * disalin (spec bagian 6). Layanan atau staf nonaktif tetap diterima: draf lama
 * boleh memuatnya, dan formulir hanya menawarkan yang aktif.
 */
async function resolveTreatments(draft: EncounterDraft): Promise<TreatmentRow[]> {
  if (draft.treatments.length === 0) return [];
  const [services, performers] = await Promise.all([
    prisma.service.findMany({
      where: { id: { in: draft.treatments.map((row) => row.serviceId) } },
      select: { id: true, name: true },
    }),
    prisma.staff.findMany({
      where: { id: { in: draft.treatments.map((row) => row.performerId) }, role: { in: ["DOKTER", "TERAPIS"] } },
      select: { id: true, name: true },
    }),
  ]);
  const serviceName = new Map(services.map((service) => [service.id, service.name]));
  const performerName = new Map(performers.map((staff) => [staff.id, staff.name]));
  return draft.treatments.map((row) => {
    const service = serviceName.get(row.serviceId);
    const performer = performerName.get(row.performerId);
    if (!service || !performer) {
      throw new UserFacingError("Treatment atau pelaksana tidak ditemukan. Muat ulang halaman.");
    }
    return { ...row, serviceName: service, performerName: performer };
  });
}

/** Menulis draf hanya bila masih DRAF dan versinya sama. Mengembalikan versi baru, atau null. */
async function writeDraft(
  tx: Prisma.TransactionClient,
  encounterId: string,
  version: Date,
  draft: EncounterDraft,
  treatments: TreatmentRow[],
): Promise<Date | null> {
  const { count } = await tx.encounter.updateMany({
    where: { id: encounterId, status: "DRAF", updatedAt: version },
    data: {
      subjective: draft.subjective,
      physicalExam: draft.physicalExam,
      assessment: draft.assessment,
      plan: draft.plan,
      pharmacyNote: draft.pharmacyNote,
      ...draft.vitals,
    },
  });
  if (count === 0) return null;
  // Baris kunjungan sudah terkunci oleh pembaruan di atas sampai transaksi selesai,
  // jadi tidak ada yang bisa memfinalisasinya di sela-sela.
  await tx.encounterTreatment.deleteMany({ where: { encounterId } });
  if (treatments.length > 0) {
    await tx.encounterTreatment.createMany({
      data: treatments.map((row, index) => ({ ...row, encounterId, sortOrder: index })),
    });
  }
  const saved = await tx.encounter.findUniqueOrThrow({ where: { id: encounterId }, select: { updatedAt: true } });
  return saved.updatedAt;
}

function revalidateEncounter(encounterId: string, patientId: string | null) {
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/kunjungan/${encounterId}`);
  if (patientId) safeRevalidatePath(`/admin/pasien/${patientId}`);
}

/**
 * Tombol Periksa (spec 4.3). Membuat kunjungan untuk booking HADIR, atau
 * mengembalikan kunjungan yang sudah ada. Tinggi badan diisikan awal dari
 * kunjungan final terakhir pasien, karena tinggi orang dewasa jarang diukur ulang.
 */
export async function openEncounter(appointmentId: string): Promise<ActionResult<{ encounterId: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const id = String(appointmentId ?? "");
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, code: true, status: true, patientId: true, encounter: { select: { id: true } } },
    });
    if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
    if (appointment.encounter) return { encounterId: appointment.encounter.id };
    if (appointment.status !== "HADIR" || !appointment.patientId) {
      throw new UserFacingError("Kunjungan hanya bisa dibuka untuk pasien yang sudah ditandai hadir.");
    }

    const heightCm = await lastHeightCm(prisma, appointment.patientId);

    try {
      const created = await prisma.encounter.create({
        data: {
          appointmentId: appointment.id,
          createdById: actor.staffId,
          createdByName: actor.name,
          heightCm,
        },
        select: { id: true },
      });
      await recordAudit({ actor, action: "encounter.create", entity: "Encounter", entityId: created.id, summary: appointment.code });
      revalidateEncounter(created.id, appointment.patientId);
      return { encounterId: created.id };
    } catch (error) {
      // Dua klik Periksa bersamaan: yang kalah memakai kunjungan milik yang menang.
      if (!isUniqueViolation(error)) throw error;
      const existing = await prisma.encounter.findUniqueOrThrow({ where: { appointmentId: appointment.id }, select: { id: true } });
      return { encounterId: existing.id };
    }
  });
}

/** Simpan otomatis draf (spec 7). Versi lama, draf final, atau draf yang dibuang ditolak dengan pesan. */
export async function saveEncounterDraft(input: {
  encounterId: string;
  version: string;
  draft: EncounterDraftInput;
}): Promise<ActionResult<{ version: string; savedAt: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const draft = readDraft(input?.draft);
    const version = readVersion(input?.version);
    const encounterId = String(input?.encounterId ?? "");
    const treatments = await resolveTreatments(draft);

    const saved = await guardLocked(() =>
      prisma.$transaction(async (tx) => {
        const updatedAt = await writeDraft(tx, encounterId, version, draft, treatments);
        if (!updatedAt) throw new UserFacingError(await whyUnchanged(tx, encounterId));
        return updatedAt;
      }),
    );

    await recordAuditThrottled({ actor, action: "encounter.edit-draft", entity: "Encounter", entityId: encounterId });
    // Membuang cache router: tanpa ini, tombol Kembali ke halaman kunjungan
    // memunculkan isian lama beserta versinya, lalu ketikan berikutnya ditolak.
    safeRevalidatePath(`/admin/kunjungan/${encounterId}`);
    return { version: saved.toISOString(), savedAt: saved.toISOString() };
  });
}

/**
 * Finalisasi (spec R5, R10, R13). Dalam satu transaksi: menyimpan isian yang
 * dikirim, mengunci catatan, menandai booking Selesai, dan memajukan kunjungan
 * terakhir pasien. Bila satu langkah gagal, semuanya batal.
 */
export async function finalizeEncounter(input: {
  encounterId: string;
  version: string;
  draft: EncounterDraftInput;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const draft = readDraft(input?.draft);
    if (!draft.assessment) throw new UserFacingError(FINALIZE_NEEDS_ASSESSMENT);
    const version = readVersion(input?.version);
    const encounterId = String(input?.encounterId ?? "");

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { appointment: { select: { id: true, code: true, startAt: true, patientId: true, branchId: true } } },
    });
    if (!encounter) throw new UserFacingError(GONE);
    const { appointment } = encounter;
    const patientId = appointment.patientId;
    if (!patientId) throw new UserFacingError(GONE);
    const treatments = await resolveTreatments(draft);

    const dispensingId = await guardLocked(() =>
      prisma.$transaction(async (tx) => {
        const updatedAt = await writeDraft(tx, encounterId, version, draft, treatments);
        if (!updatedAt) throw new UserFacingError(await whyUnchanged(tx, encounterId));
        await tx.encounter.update({
          where: { id: encounterId },
          data: { status: "FINAL", finalizedAt: new Date(), finalizedById: actor.staffId, finalizedByName: actor.name },
        });
        const done = await tx.appointment.updateMany({
          where: { id: appointment.id, status: "HADIR" },
          data: { status: "SELESAI" },
        });
        if (done.count === 0) throw new UserFacingError("Status booking baru saja berubah. Muat ulang halaman.");
        await tx.patient.updateMany({
          where: { id: patientId, OR: [{ lastVisitAt: null }, { lastVisitAt: { lt: appointment.startAt } }] },
          data: { lastVisitAt: appointment.startAt },
        });
        // Catatan untuk Apoteker terisi: satu penyerahan Menunggu di cabang booking (spec penyerahan 3.3).
        if (!draft.pharmacyNote) return null;
        const created = await tx.dispensing.create({
          data: { appointmentId: appointment.id, branchId: appointment.branchId },
          select: { id: true },
        });
        return created.id;
      }),
    );

    await recordAudit({ actor, action: "encounter.finalize", entity: "Encounter", entityId: encounterId, summary: appointment.code });
    if (dispensingId) {
      await recordAudit({ actor, action: "dispensing.create", entity: "Dispensing", entityId: dispensingId, summary: appointment.code });
      safeRevalidatePath("/admin/resep");
    }
    revalidateEncounter(encounterId, patientId);
    safeRevalidatePath("/admin/booking");
  });
}

/** Buang draf (spec R9): hanya draf dengan versi yang sama; booking kembali "Belum diperiksa". */
export async function discardEncounterDraft(input: { encounterId: string; version: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const version = readVersion(input?.version);
    const encounterId = String(input?.encounterId ?? "");
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { appointment: { select: { code: true, patientId: true } } },
    });
    if (!encounter) throw new UserFacingError(GONE);

    const { count } = await guardLocked(() =>
      prisma.encounter.deleteMany({ where: { id: encounterId, status: "DRAF", updatedAt: version } }),
    );
    if (count === 0) throw new UserFacingError(await whyUnchanged(prisma, encounterId));

    await recordAudit({
      actor,
      action: "encounter.discard",
      entity: "Encounter",
      entityId: encounterId,
      summary: encounter.appointment.code,
    });
    revalidateEncounter(encounterId, encounter.appointment.patientId);
  });
}

/** Adendum (PRD F12): koreksi atas catatan final, dengan penulis dan waktu. */
export async function addEncounterAddendum(input: { encounterId: string; text: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const text = String(input?.text ?? "").trim();
    if (!text) throw new UserFacingError("Tulis isi adendum dulu.");
    if (text.length > ENCOUNTER_TEXT_MAX) throw new UserFacingError("Adendum terlalu panjang (maks. 5.000 karakter).");
    const encounterId = String(input?.encounterId ?? "");

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { status: true, appointment: { select: { code: true, patientId: true } } },
    });
    if (!encounter) throw new UserFacingError(GONE);
    if (encounter.status !== "FINAL") throw new UserFacingError("Adendum hanya untuk catatan yang sudah final.");

    await guardLocked(() =>
      prisma.encounterAddendum.create({ data: { encounterId, text, authorId: actor.staffId, authorName: actor.name } }),
    );
    await recordAudit({
      actor,
      action: "encounter.addendum",
      entity: "Encounter",
      entityId: encounterId,
      summary: encounter.appointment.code,
    });
    revalidateEncounter(encounterId, encounter.appointment.patientId);
  });
}

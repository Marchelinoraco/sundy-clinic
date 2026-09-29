"use server";

import type { Patient } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { recordAudit } from "@/server/audit";
import { insertPatient } from "@/server/patient-store";
import { requireCapability } from "@/server/session";

export async function createPatient(input: {
  name: string;
  whatsapp: string;
  birthDate?: string;
  gender?: "L" | "P";
  occupation?: string;
  address?: string;
}): Promise<ActionResult<Patient>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");

    // Divalidasi SEBELUM nomor rekam medis dialokasikan: nomor urut yang
    // sudah diambil tidak pernah dikembalikan, jadi input yang ditolak
    // tidak boleh sempat memakannya.
    const name = input.name.trim();
    if (!name) throw new UserFacingError("Nama pasien wajib diisi.");
    const whatsapp = normalizeWhatsapp(input.whatsapp);
    if (!whatsapp) {
      throw new UserFacingError("Nomor WhatsApp tidak sah. Contoh: 081234567890.");
    }

    const patient = await insertPatient(prisma, {
      name,
      whatsapp,
      birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null,
      gender: input.gender,
      occupation: input.occupation,
      address: input.address,
    });

    await recordAudit({
      actor,
      action: "patient.create",
      entity: "Patient",
      entityId: patient.id,
      summary: `${patient.name} (${patient.medicalRecordNumber})`,
    });

    safeRevalidatePath("/admin/pasien");
    return patient;
  });
}

export async function getPatientById(id: string): Promise<Patient | null> {
  await requireCapability("booking:manage");
  return prisma.patient.findUnique({ where: { id } });
}

export async function listRecentPatients(limit = 50): Promise<Patient[]> {
  await requireCapability("booking:manage");
  return prisma.patient.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

/** Cocok terhadap nama (sebagian, tanpa peduli huruf besar/kecil) atau nomor WhatsApp. */
export async function searchPatients(query: string): Promise<Patient[]> {
  await requireCapability("booking:manage");
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Nomor tersimpan berawalan 62, sedangkan admin lazim mengetik 0812….
  const phoneVariants: { whatsapp: { contains: string } }[] = [];
  if (/^[\d\s()+-]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, "");
    if (digits) {
      phoneVariants.push({
        whatsapp: { contains: digits.startsWith("0") ? `62${digits.slice(1)}` : digits },
      });
    }
  }

  return prisma.patient.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { whatsapp: { contains: trimmed } },
        { medicalRecordNumber: { contains: trimmed, mode: "insensitive" } },
        ...phoneVariants,
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
  });
}

/** Dipakai saat membuat pasien baru untuk menawarkan penggabungan bila nomor sudah terdaftar. */
export async function findPatientsByWhatsapp(whatsapp: string): Promise<Patient[]> {
  await requireCapability("booking:manage");
  const normalized = normalizeWhatsapp(whatsapp);
  if (!normalized) return [];
  return prisma.patient.findMany({ where: { whatsapp: normalized } });
}

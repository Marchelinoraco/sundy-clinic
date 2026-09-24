"use server";

import type { Patient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatMedicalRecordNumber } from "@/lib/medical-record-number";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Mengalokasikan nomor urut berikutnya untuk tahun ini secara atomik.
 *
 * INSERT ... ON CONFLICT DO UPDATE adalah satu pernyataan tunggal di
 * PostgreSQL — baris dikunci selama pernyataan itu berjalan, sehingga dua
 * panggilan bersamaan tidak akan pernah membaca nilai yang sama sebelum
 * menulis. Ini yang membuat nomor rekam medis dijamin unik tanpa perlu
 * transaksi terpisah atau retry.
 */
async function nextMedicalRecordSequence(year: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "PatientNumberCounter" ("year", "value")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "PatientNumberCounter"."value" + 1
    RETURNING "value"
  `;
  return rows[0].value;
}

export async function createPatient(input: {
  name: string;
  whatsapp: string;
  birthDate?: string;
  gender?: "L" | "P";
  occupation?: string;
  address?: string;
}): Promise<Patient> {
  const actor = await requireCapability("booking:manage");

  const year = new Date().getFullYear();
  const sequence = await nextMedicalRecordSequence(year);
  const medicalRecordNumber = formatMedicalRecordNumber(year, sequence);

  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber,
      name: input.name,
      whatsapp: input.whatsapp,
      birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null,
      gender: input.gender,
      occupation: input.occupation,
      address: input.address,
    },
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
}

export async function getPatientById(id: string): Promise<Patient | null> {
  await requireCapability("booking:manage");
  return prisma.patient.findUnique({ where: { id } });
}

/** Cocok terhadap nama (sebagian, tanpa peduli huruf besar/kecil) atau nomor WhatsApp. */
export async function searchPatients(query: string): Promise<Patient[]> {
  await requireCapability("booking:manage");
  const trimmed = query.trim();
  if (!trimmed) return [];

  return prisma.patient.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { whatsapp: { contains: trimmed } },
        { medicalRecordNumber: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
  });
}

/** Dipakai saat membuat pasien baru untuk menawarkan penggabungan bila nomor sudah terdaftar. */
export async function findPatientsByWhatsapp(whatsapp: string): Promise<Patient[]> {
  await requireCapability("booking:manage");
  return prisma.patient.findMany({ where: { whatsapp } });
}

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/action-result";
import { BIA_MAX_BYTES, BIA_MAX_FILES, biaAccess, detectBiaFileType, safeOriginalName } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { removeBiaFile, writeBiaFile } from "@/server/bia-storage";
import { isUniqueViolation } from "@/server/db-errors";
import type { CurrentStaff } from "@/server/session";

type AppointmentForBia = { status: string; channel: "KLINIK" | "ONLINE" };

/** Alasan yang dibaca staf bila unggahan ditolak (spec hasil BIA 3.3 dan 5). */
function uploadDenial(role: CurrentStaff["role"], appointment: AppointmentForBia): string {
  if (appointment.channel !== "KLINIK") return "Konsultasi online tidak ditimbang, jadi tidak punya hasil BIA.";
  if (appointment.status !== "HADIR" && appointment.status !== "SELESAI") return "Hasil BIA hanya bisa diunggah setelah pasien check-in.";
  if (appointment.status === "SELESAI" && role === "RESEPSIONIS") return "Kunjungan sudah final. Minta dokter menambahkan hasil BIA.";
  return "Anda tidak bisa mengunggah hasil BIA untuk booking ini.";
}

type Tx = Prisma.TransactionClient;

/** Pengukuran aktif booking ini; dibuat bila belum ada. Dua pembuatan serentak: yang kalah kena indeks unik dan diulang oleh pemanggil. */
export async function ensureActiveMeasurement(
  tx: Tx,
  input: { appointmentId: string; patientId: string; actor: Pick<CurrentStaff, "staffId" | "name"> },
): Promise<string> {
  const existing = await tx.biaMeasurement.findFirst({ where: { appointmentId: input.appointmentId, voidedAt: null }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.biaMeasurement.create({
    data: { appointmentId: input.appointmentId, patientId: input.patientId, createdById: input.actor.staffId, createdByName: input.actor.name },
    select: { id: true },
  });
  return created.id;
}

/**
 * Menyimpan satu berkas hasil BIA (spec hasil BIA 4). Urutan: periksa → tulis ke disk → catat di basis data dalam satu
 * transaksi (dengan kunci baris pengukuran supaya batas 5 berkas tidak bisa dilewati serentak). Bila pencatatan gagal,
 * berkas di disk dihapus lagi.
 */
export async function uploadBiaFile(input: {
  actor: CurrentStaff;
  appointmentId: string;
  originalName: string;
  bytes: Uint8Array;
}): Promise<{ fileId: string; measurementId: string }> {
  const { actor, bytes } = input;
  const appointment = await prisma.appointment.findUnique({
    where: { id: String(input.appointmentId ?? "") },
    select: { id: true, code: true, status: true, channel: true, patientId: true },
  });
  if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
  if (!appointment.patientId) throw new UserFacingError("Booking ini belum punya pasien. Cocokkan pasien dulu.");
  if (!biaAccess(actor.role, appointment).upload) throw new UserFacingError(uploadDenial(actor.role, appointment));

  if (bytes.length === 0) throw new UserFacingError("Berkas kosong.");
  if (bytes.length > BIA_MAX_BYTES) throw new UserFacingError("Berkas terlalu besar (maks. 10 MB).");
  const type = detectBiaFileType(bytes);
  if (!type) throw new UserFacingError("Jenis berkas tidak didukung. Gunakan foto (JPG, PNG, WebP, HEIC) atau PDF.");

  const originalName = safeOriginalName(input.originalName);
  const storageName = await writeBiaFile(bytes, type.ext);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const patientId = appointment.patientId;

  let saved: { fileId: string; measurementId: string };
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        saved = await prisma.$transaction(async (tx) => {
          const measurementId = await ensureActiveMeasurement(tx, { appointmentId: appointment.id, patientId, actor });
          await tx.$queryRaw`SELECT "id" FROM "BiaMeasurement" WHERE "id" = ${measurementId} FOR UPDATE`;
          if (appointment.status === "SELESAI") {
            // Setelah final, berkas hanya boleh masuk ke pengukuran koreksi yang angkanya belum tersimpan (spec 3.3).
            const current = await tx.biaMeasurement.findUniqueOrThrow({ where: { id: measurementId }, select: { numbersAt: true } });
            if (current.numbersAt) throw new UserFacingError("Kunjungan sudah final dan angka BIA sudah tersimpan. Batalkan pengukuran lalu tambah yang baru.");
          }
          const active = await tx.biaFile.count({ where: { measurementId, voidedAt: null } });
          if (active >= BIA_MAX_FILES) throw new UserFacingError(`Satu pengukuran paling banyak ${BIA_MAX_FILES} berkas. Batalkan salah satu dulu.`);
          const file = await tx.biaFile.create({
            data: {
              measurementId,
              storageName,
              originalName,
              mimeType: type.mime,
              sizeBytes: bytes.length,
              sha256,
              uploadedById: actor.staffId,
              uploadedByName: actor.name,
            },
            select: { id: true },
          });
          return { fileId: file.id, measurementId };
        });
        break;
      } catch (error) {
        // Dua unggahan pertama serentak: yang kalah membuat pengukuran kedua dan kena indeks unik; ulang sekali, kini pengukurannya ada.
        if (isUniqueViolation(error) && attempt === 0) continue;
        throw error;
      }
    }
  } catch (error) {
    await removeBiaFile(storageName).catch(() => undefined);
    throw error;
  }

  // Berkas sudah tercatat: kegagalan menulis audit tidak boleh menghapus berkasnya atau menyebut unggahan gagal.
  // Barisnya sendiri menyimpan siapa yang mengunggah dan kapan.
  await recordAudit({
    actor,
    action: "bia.upload",
    entity: "BiaMeasurement",
    entityId: saved.measurementId,
    summary: `${appointment.code} · ${originalName}`,
  }).catch((error) => console.error("Gagal mencatat audit unggahan BIA", saved.fileId, error));
  return saved;
}

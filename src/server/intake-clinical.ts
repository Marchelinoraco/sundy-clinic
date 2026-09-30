import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
import { clinicalView, type ClinicalSection } from "@/lib/kuis/clinical-view";
import type { ActivityRow } from "@/lib/kuis/v1/describe";
import type { HabitTable } from "@/lib/kuis/v2/describe";
import type { RecordProposal } from "@/lib/kuis/v2/record-proposal";
import { mergeRecordText } from "@/lib/record-text";

/** Isi klinis sebuah isian untuk staf ber-record:read (spec pendaftaran 6.2). */
export type IntakeClinical = {
  sections: ClinicalSection[];
  activities: ActivityRow[] | null;
  activityDateLabel: string | null;
  /** Tabel kebiasaan (form recall) — isian kuis versi 2. */
  habits: HabitTable | null;
};

/**
 * Kolom klinis isian dibaca dengan kueri terpisah, hanya untuk yang berhak.
 * Berkas ini sengaja bukan "use server": fungsinya tidak boleh bisa dipanggil
 * dari browser. Pemanggil wajib sudah memeriksa record:read. Versi kuis yang
 * tidak dikenal melempar galat dari clinicalView.
 */
export async function loadIntakeClinical(
  intakeId: string,
): Promise<{ clinical: IntakeClinical; proposal: RecordProposal; pregnancy: boolean } | null> {
  const row = await prisma.intake.findUniqueOrThrow({
    where: { id: intakeId },
    select: { quizVersion: true, answers: true, selfWeightKg: true, selfHeightCm: true, activityDate: true },
  });
  if (row.answers === null) return null;

  const view = clinicalView({
    quizVersion: row.quizVersion,
    answers: row.answers,
    weightKg: row.selfWeightKg === null ? null : Number(row.selfWeightKg),
    heightCm: row.selfHeightCm === null ? null : Number(row.selfHeightCm),
  });
  return {
    proposal: view.proposal,
    pregnancy: view.pregnancy,
    clinical: {
      sections: view.sections,
      activities: view.activities,
      habits: view.habits,
      activityDateLabel: row.activityDate ? formatIndonesianDate(row.activityDate) : null,
    },
  };
}

export type IntakeApproval =
  | { state: "needs-match" }
  | {
      state: "ready";
      patientId: string;
      /** updatedAt pasien (ISO) saat halaman dibuka; simpan ditolak bila data pasien berubah sesudahnya. */
      patientVersion: string;
      current: { allergies: string | null; medicalHistory: string | null };
      proposed: RecordProposal;
      /** Isi awal kolom sunting. */
      prefill: { allergies: string; medicalHistory: string };
    };

export type ReadyIntakeApproval = Extract<IntakeApproval, { state: "ready" }>;

/**
 * Usulan berdampingan dengan catatan pasien saat ini (spec pendaftaran 6.4).
 * Isian yang sudah diperiksa tidak menggabungkan usulan lagi: baris yang
 * sengaja dihapus dokter tidak boleh muncul kembali. Dipakai halaman isian
 * dan halaman kunjungan; pemanggil wajib sudah memeriksa record:write.
 */
export async function loadApproval(patientId: string, proposed: RecordProposal, reviewed: boolean): Promise<ReadyIntakeApproval> {
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { allergies: true, medicalHistory: true, updatedAt: true },
  });
  return {
    state: "ready",
    patientId,
    patientVersion: patient.updatedAt.toISOString(),
    current: { allergies: patient.allergies, medicalHistory: patient.medicalHistory },
    proposed,
    prefill: reviewed
      ? { allergies: patient.allergies ?? "", medicalHistory: patient.medicalHistory ?? "" }
      : {
          allergies: mergeRecordText(patient.allergies, proposed.allergies),
          medicalHistory: mergeRecordText(patient.medicalHistory, proposed.medicalHistory),
        },
  };
}

import { prisma } from "@/lib/db";
import { formatIndonesianDate } from "@/lib/format";
import { clinicalView, type ClinicalSection } from "@/lib/kuis/clinical-view";
import type { ActivityRow } from "@/lib/kuis/v1/describe";
import type { HabitTable } from "@/lib/kuis/v2/describe";
import type { RecordProposal } from "@/lib/kuis/v2/record-proposal";

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

import { quizAnswersSchema as v1Schema } from "./v1/answers";
import { activityTable, describeAnswers as describeV1, type ActivityRow } from "./v1/describe";
import { proposeRecordFromAnswers as proposeV1 } from "./v1/record-proposal";
import { quizAnswersSchema as v2Schema } from "./v2/answers";
import { describeAnswers as describeV2, habitTable, type HabitTable } from "./v2/describe";
import { proposeRecordFromAnswers as proposeV2, type RecordProposal } from "./v2/record-proposal";

export type ClinicalSection = { title: string; lines: string[] };

export type ClinicalView = {
  sections: ClinicalSection[];
  /** Tabel aktivitas kemarin — hanya isian versi 1 customer lama. */
  activities: ActivityRow[] | null;
  /** Tabel kebiasaan (form recall) — hanya isian versi 2. */
  habits: HabitTable | null;
  proposal: RecordProposal;
};

/**
 * Isi klinis sebuah isian untuk staf, menurut versi kuis yang benar-benar
 * dijawab customer (spec kuis v2, bagian 7). Berat & tinggi datang dari kolom
 * bertipe, bukan dari JSON jawaban.
 */
export function clinicalView(input: {
  quizVersion: number | null;
  answers: unknown;
  weightKg: number | null;
  heightCm: number | null;
}): ClinicalView {
  if (input.quizVersion === 1) {
    const answers = v1Schema.parse(input.answers);
    if (answers.slimming && input.weightKg !== null && input.heightCm !== null) {
      answers.slimming.weightKg = input.weightKg;
      answers.slimming.heightCm = input.heightCm;
    }
    return {
      // Aktivitas tampil sebagai tabel 06.00–22.00, bukan daftar baris.
      sections: describeV1(answers).filter((section) => section.step !== "P3"),
      activities: answers.returning?.activities ? activityTable(answers.returning.activities) : null,
      habits: null,
      proposal: proposeV1(answers),
    };
  }
  if (input.quizVersion === 2) {
    const answers = v2Schema.parse(input.answers);
    if (input.weightKg !== null && input.heightCm !== null) {
      answers.body = { weightKg: input.weightKg, heightCm: input.heightCm };
    }
    return {
      sections: describeV2(answers, "staff"),
      activities: null,
      habits: answers.habits ? habitTable(answers.habits) : null,
      proposal: proposeV2(answers),
    };
  }
  throw new Error(`Isian dengan kuis versi ${input.quizVersion} belum bisa ditampilkan.`);
}

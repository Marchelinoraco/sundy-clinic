import type { QuizAnswers } from "./answers";
import { conditionName, selectedConditions } from "./steps";

export type RecordProposal = {
  /** null bila isian tidak memuat pertanyaan ini (mis. customer lama tanpa perubahan kesehatan). */
  allergies: string | null;
  medicalHistory: string | null;
};

/**
 * Usulan teks Alergi dan Riwayat penyakit & obat dari jawaban kuis v2 (bagian
 * kesehatan sama persis dengan versi 1). Dokter menyuntingnya sebelum masuk ke
 * data pasien (spec 6.4, K12).
 */
export function proposeRecordFromAnswers(a: QuizAnswers): RecordProposal {
  const h = a.health;
  if (!h) return { allergies: null, medicalHistory: null };

  let allergies: string | null = null;
  if (h.allergies?.has === true) allergies = h.allergies.text?.trim() || "Ada alergi (belum dijelaskan pasien)";
  else if (h.allergies?.has === false) allergies = "Tidak ada";

  const lines: string[] = [];
  const conditions = selectedConditions(a);
  for (const condition of conditions) {
    const medication = h.medications?.[condition];
    const drug = medication?.none ? "tidak minum obat" : medication?.text?.trim() || "obat tidak disebutkan";
    lines.push(`${conditionName(a, condition)}: ${drug}`);
  }
  if (conditions.length === 0 && h.conditions?.includes("TIDAK_ADA")) lines.push("Tidak ada riwayat penyakit");
  if (h.otherMeds?.has) {
    lines.push(`Obat/suplemen lain: ${h.otherMeds.text?.trim() || "belum dijelaskan pasien"}`);
  }

  return { allergies, medicalHistory: lines.length > 0 ? lines.join("\n") : null };
}

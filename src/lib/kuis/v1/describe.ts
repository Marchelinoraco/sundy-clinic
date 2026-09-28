import { minutesToTimeLabel } from "@/lib/time";
import type { ActivityEntry, QuizAnswers } from "./answers";
import {
  ACTIVITY_FIRST_HOUR,
  ACTIVITY_KINDS,
  ACTIVITY_LAST_HOUR,
  BODY_AREAS,
  COMPLAINT_DURATIONS,
  DIET_HISTORY,
  MEALS,
  PREGNANCY,
  PRIOR_TREATMENTS,
  PURPOSES,
  SKIN_COMPLAINTS,
  SKIN_TYPES,
  SLIMMING_GOALS,
  WEIGHT_AFTER_DIET,
  WEIGHT_TARGETS,
} from "./options";
import { conditionName, dietProgramName, selectedConditions, type StepId } from "./steps";

export type IntakeSection = { title: string; step: StepId; lines: string[] };

const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** 28.8 → "28,8" — tanda desimal Indonesia. */
export function formatDecimal(value: number): string {
  return decimal.format(value);
}

export function bodyMassIndex(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

export type ActivityRow = {
  hour: number;
  label: string;
  entries: { kindLabel: string; text: string }[];
};

/** Tabel 06.00–22.00 yang dilihat dokter (K7); jam tanpa catatan tetap tampil kosong. */
export function activityTable(activities: ActivityEntry[]): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (let hour = ACTIVITY_FIRST_HOUR; hour <= ACTIVITY_LAST_HOUR; hour++) {
    rows.push({
      hour,
      label: minutesToTimeLabel(hour * 60),
      entries: activities
        .filter((entry) => entry.hour === hour)
        .map((entry) => ({ kindLabel: ACTIVITY_KINDS[entry.kind], text: entry.text })),
    });
  }
  return rows;
}

function labels<T extends Record<string, string>>(map: T, keys: readonly (keyof T)[] | undefined): string {
  return (keys ?? []).map((key) => map[key]).join(", ");
}

/**
 * Jawaban per bagian dalam kalimat yang dibaca pasien (layar Ringkasan) dan
 * dokter (halaman isian). `step` menunjuk layar pertama bagian itu — dipakai
 * tombol "Ubah" di Ringkasan.
 */
export function describeAnswers(a: QuizAnswers): IntakeSection[] {
  const sections: IntakeSection[] = [];
  if (!a.purpose || !a.patientType) return sections;

  sections.push({
    title: "Tujuan konsultasi",
    step: "U2",
    lines: [`${PURPOSES[a.purpose]} · ${a.patientType === "LAMA" ? "pasien lama" : "pasien baru"}`],
  });

  const s = a.slimming;
  if (s) {
    sections.push({
      title: "Tujuan & target",
      step: "S1",
      lines: [
        s.goal && `Tujuan utama: ${SLIMMING_GOALS[s.goal]}`,
        s.weightTarget && `Target turun: ${WEIGHT_TARGETS[s.weightTarget]}`,
        s.areas?.length && `Area: ${labels(BODY_AREAS, s.areas)}`,
      ].filter((line): line is string => Boolean(line)),
    });

    const dietLines: string[] = s.dietHistory ? [DIET_HISTORY[s.dietHistory]] : [];
    for (const program of s.dietPrograms ?? []) {
      const result = s.dietResults?.[program];
      const name = dietProgramName(a, program);
      if (result?.outcome === "BERHASIL") {
        const lost = result.lostKg !== undefined ? ` −${formatDecimal(result.lostKg)} kg` : "";
        const after = result.weightAfter ? `, ${WEIGHT_AFTER_DIET[result.weightAfter].toLowerCase()}` : "";
        dietLines.push(`${name}: berhasil${lost}${after}`);
      } else if (result?.outcome === "MASIH_JALAN") {
        const lost = result.lostKg !== undefined ? ` −${formatDecimal(result.lostKg)} kg` : "";
        dietLines.push(`${name}: masih jalan${lost}`);
      } else if (result?.outcome === "TIDAK_BERHASIL") {
        dietLines.push(`${name}: tidak berhasil`);
      }
    }
    sections.push({ title: "Riwayat diet", step: "S4", lines: dietLines });

    if (s.weightKg !== undefined && s.heightCm !== undefined) {
      sections.push({
        title: "Berat & tinggi (ukuran mandiri)",
        step: "S7",
        lines: [
          `${formatDecimal(s.weightKg)} kg · ${formatDecimal(s.heightCm)} cm · IMT ${formatDecimal(bodyMassIndex(s.weightKg, s.heightCm))}`,
        ],
      });
    }

    sections.push({
      title: "Pola makan sehari",
      step: "S8",
      lines: (Object.keys(MEALS) as (keyof typeof MEALS)[])
        .filter((meal) => s.foodRecall?.[meal])
        .map((meal) => `${MEALS[meal]}: ${s.foodRecall?.[meal]}`),
    });
  }

  const ae = a.aesthetic;
  if (ae) {
    const complaints = (ae.complaints ?? []).map((c) =>
      c === "LAINNYA" && ae.complaintOther ? ae.complaintOther : SKIN_COMPLAINTS[c],
    );
    sections.push({
      title: "Keluhan kulit",
      step: "A1",
      lines: [
        `Keluhan: ${complaints.join(", ")}`,
        ae.skinType && `Jenis kulit: ${SKIN_TYPES[ae.skinType]}`,
        ae.duration && `Lama keluhan: ${COMPLAINT_DURATIONS[ae.duration]}`,
      ].filter((line): line is string => Boolean(line)),
    });
    const treatments = (ae.priorTreatments ?? []).map((t) =>
      t === "LAINNYA" && ae.priorTreatmentOther ? ae.priorTreatmentOther : PRIOR_TREATMENTS[t],
    );
    sections.push({
      title: "Perawatan sebelumnya",
      step: "A4",
      lines: [`Treatment: ${treatments.join(", ")}`, ae.skincare && `Skincare: ${ae.skincare}`].filter(
        (line): line is string => Boolean(line),
      ),
    });
  }

  if (a.unsure?.story) {
    sections.push({ title: "Cerita pasien", step: "B1", lines: [a.unsure.story] });
  }

  const r = a.returning;
  if (r) {
    sections.push({
      title: "Kunjungan ini",
      step: "P1",
      lines: [
        r.story ?? "",
        r.healthChanged ? "Ada perubahan penyakit atau obat" : "Tidak ada perubahan penyakit atau obat",
      ].filter(Boolean),
    });
  }

  const h = a.health;
  if (h) {
    const conditions = selectedConditions(a);
    const lines =
      conditions.length === 0
        ? ["Riwayat penyakit: tidak ada"]
        : conditions.map((condition) => {
            const medication = h.medications?.[condition];
            return `${conditionName(a, condition)}: ${medication?.none ? "tidak minum obat" : medication?.text ?? "-"}`;
          });
    lines.push(`Obat/suplemen lain: ${h.otherMeds?.has ? (h.otherMeds.text || "belum diisi") : "tidak ada"}`);
    lines.push(`Alergi: ${h.allergies?.has ? (h.allergies.text || "belum diisi") : "tidak ada"}`);
    if (h.pregnancy) lines.push(`Hamil/menyusui: ${PREGNANCY[h.pregnancy]}`);
    sections.push({ title: "Kesehatan", step: "K1", lines });
  }

  if (r?.activities?.length) {
    sections.push({
      title: "Aktivitas kemarin",
      step: "P3",
      lines: [...r.activities]
        .sort((x, y) => x.hour - y.hour)
        .map((entry) => `${minutesToTimeLabel(entry.hour * 60)} · ${ACTIVITY_KINDS[entry.kind]} · ${entry.text}`),
    });
  }

  return sections;
}

"use client";

import type { QuizAnswers } from "@/lib/kuis/v2/answers";
import { describeAnswers } from "@/lib/kuis/v2/describe";
import { pruneAnswers, type StepId } from "@/lib/kuis/v2/steps";

/** Layar R (K8): jawaban diulang per bagian, masing-masing bisa diubah. Tanpa diagnosis, tanpa janji hasil. */
export function SummaryStep({ answers, onEdit }: { answers: QuizAnswers; onEdit: (step: StepId) => void }) {
  const sections = describeAnswers(pruneAnswers(answers), "customer");
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <section key={section.title} className="rounded-2xl border border-cream-300 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-brown-900">{section.title}</h2>
            <button
              type="button"
              className="text-sm text-gold-600 underline underline-offset-4"
              aria-label={`Ubah ${section.title}`}
              onClick={() => onEdit(section.step)}
            >
              Ubah
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-brown-700">
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-brown-600">Dokter kami akan membahas ini bersama Anda saat konsultasi.</p>
    </div>
  );
}

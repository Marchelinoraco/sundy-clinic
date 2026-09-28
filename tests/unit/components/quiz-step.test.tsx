import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuizStep, type AnswerPatch } from "@/components/kuis/quiz-step";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";

function lastPatch(mock: ReturnType<typeof vi.fn>, from: QuizAnswers): QuizAnswers {
  const patch = mock.mock.calls.at(-1)?.[0] as AnswerPatch;
  return patch(from);
}

describe("QuizStep", () => {
  it("U2: pilihan tunggal memakai onChoose agar layar maju sendiri", async () => {
    const onChoose = vi.fn();
    render(<QuizStep step="U2" answers={{ patientType: "BARU" }} onChange={vi.fn()} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("radio", { name: /Aesthetic/ }));
    expect(lastPatch(onChoose, { patientType: "BARU" })).toEqual({ patientType: "BARU", purpose: "AESTHETIC" });
  });

  it("K2: satu kelompok obat per penyakit, dengan nama penyakit lain yang diketik pasien", () => {
    render(
      <QuizStep
        step="K2"
        answers={{ health: { conditions: ["DIABETES", "LAINNYA"], conditionOther: "Asma" } }}
        onChange={vi.fn()}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole("group", { name: "Diabetes" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Asma" })).toBeInTheDocument();
  });

  it("S6: satu kelompok hasil per program diet yang dipilih", async () => {
    const onChange = vi.fn();
    const answers: QuizAnswers = { slimming: { dietHistory: "PERNAH", dietPrograms: ["KETO"] } };
    render(<QuizStep step="S6" answers={answers} onChange={onChange} onChoose={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Berhasil" }));
    expect(lastPatch(onChange, answers).slimming?.dietResults).toEqual({ KETO: { outcome: "BERHASIL" } });
  });

  it("P2: 'Ada' menyalakan pertanyaan kesehatan pasien lama", async () => {
    const onChoose = vi.fn();
    render(<QuizStep step="P2" answers={{ patientType: "LAMA" }} onChange={vi.fn()} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("radio", { name: "Ada" }));
    expect(lastPatch(onChoose, {}).returning).toEqual({ healthChanged: true });
  });
});

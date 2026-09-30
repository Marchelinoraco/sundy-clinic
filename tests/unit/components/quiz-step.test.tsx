import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuizStep, type AnswerPatch } from "@/components/kuis/quiz-step";
import type { QuizAnswers } from "@/lib/kuis/v2/answers";

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

  it("U2: tiga tujuan, termasuk konsultasi dokter spesialis gizi klinik", async () => {
    const onChoose = vi.fn();
    render(<QuizStep step="U2" answers={{ patientType: "BARU" }} onChange={vi.fn()} onChoose={onChoose} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    await userEvent.click(screen.getByRole("radio", { name: /Konsultasi dokter spesialis gizi klinik/ }));
    expect(lastPatch(onChoose, { patientType: "BARU" })).toEqual({ patientType: "BARU", purpose: "GIZI_KLINIK" });
  });

  it("F2: memilih jam sarapan dan menulis isinya; 'Saya tidak sarapan' menyembunyikan keduanya", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<QuizStep step="F2" answers={{}} onChange={onChange} onChoose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Jam sarapan"), "07.00");
    expect(lastPatch(onChange, {}).habits?.breakfast).toEqual({ hour: 7 });

    await userEvent.click(screen.getByLabelText("Saya tidak sarapan"));
    expect(lastPatch(onChange, {}).habits?.breakfast).toEqual({ none: true });

    rerender(<QuizStep step="F2" answers={{ habits: { breakfast: { none: true } } }} onChange={onChange} onChoose={vi.fn()} />);
    expect(screen.queryByLabelText("Jam sarapan")).not.toBeInTheDocument();
  });

  it("F5: 'Jarang atau tidak pernah' tidak menanyakan jam dan isi; 'Tidak tentu' menggantikan jam", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <QuizStep step="F5" answers={{ habits: { snack: { frequency: "JARANG" } } }} onChange={onChange} onChoose={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Jam cemilan")).not.toBeInTheDocument();

    const answers: QuizAnswers = { habits: { snack: { frequency: "SERING", hour: 16 } } };
    rerender(<QuizStep step="F5" answers={answers} onChange={onChange} onChoose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Jam cemilan"), "Tidak tentu");
    expect(lastPatch(onChange, answers).habits?.snack).toEqual({ frequency: "SERING", anytime: true });
  });

  it("F6: olahraga rutin menanyakan jenis, menit, kali seminggu, dan jam", async () => {
    const onChange = vi.fn();
    const answers: QuizAnswers = { habits: { exercise: { routine: "RUTIN" } } };
    render(<QuizStep step="F6" answers={answers} onChange={onChange} onChoose={vi.fn()} />);
    expect(screen.getByLabelText("Jenis olahraga")).toBeInTheDocument();
    expect(screen.getByLabelText("Berapa menit sekali olahraga")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "3×" }));
    expect(lastPatch(onChange, answers).habits?.exercise).toEqual({ routine: "RUTIN", perWeek: 3 });
    expect(screen.getByLabelText("Jam olahraga")).toBeInTheDocument();
  });

  it("F7: tiga pertanyaan rokok, alkohol, dan soda", async () => {
    const onChange = vi.fn();
    render(<QuizStep step="F7" answers={{}} onChange={onChange} onChoose={vi.fn()} />);
    const soda = screen.getByRole("radiogroup", { name: "Minuman bersoda" });
    await userEvent.click(within(soda).getByRole("radio", { name: "Kadang" }));
    expect(lastPatch(onChange, {}).habits).toEqual({ soda: "KADANG" });
    expect(screen.getByRole("radiogroup", { name: "Merokok" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Minum alkohol" })).toBeInTheDocument();
  });
});

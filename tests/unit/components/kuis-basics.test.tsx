import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityList } from "@/components/kuis/activity-list";
import { MultiChoice, SingleChoice, optionsOf } from "@/components/kuis/choice";
import { MedicationFields } from "@/components/kuis/fields";
import { QuizScreen } from "@/components/kuis/quiz-screen";
import { BODY_AREAS, PURPOSES } from "@/lib/kuis/v1/options";

describe("QuizScreen", () => {
  it("baru menampilkan pesan setelah Lanjut ditekan, dan tidak maju bila belum lengkap", async () => {
    const onNext = vi.fn();
    render(
      <QuizScreen title="Judul" progress={0.5} onNext={onNext} error="Pilih minimal satu.">
        isi
      </QuizScreen>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

    await userEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pilih minimal satu.");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("maju bila layar lengkap", async () => {
    const onNext = vi.fn();
    render(<QuizScreen title="Judul" progress={0.5} onNext={onNext} error={null}>isi</QuizScreen>);
    await userEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("SingleChoice & MultiChoice", () => {
  it("mengirim pilihan yang diketuk", async () => {
    const onChange = vi.fn();
    render(<SingleChoice label="Tujuan" options={optionsOf(PURPOSES)} value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /Slimming/ }));
    expect(onChange).toHaveBeenCalledWith("SLIMMING");
  });

  it("pilihan eksklusif menghapus pilihan lain, dan sebaliknya", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MultiChoice label="Area" options={optionsOf(BODY_AREAS)} values={["PERUT"]} exclusive="TIDAK_ADA" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Tidak ada area khusus/ }));
    expect(onChange).toHaveBeenLastCalledWith(["TIDAK_ADA"]);

    rerender(
      <MultiChoice label="Area" options={optionsOf(BODY_AREAS)} values={["TIDAK_ADA"]} exclusive="TIDAK_ADA" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Perut/ }));
    expect(onChange).toHaveBeenLastCalledWith(["PERUT"]);
  });
});

describe("MedicationFields", () => {
  it("satu kelompok per penyakit; 'Tidak minum obat' mengosongkan dan mengunci kolom obat", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MedicationFields
        conditions={[{ key: "DARAH_TINGGI", name: "Darah tinggi" }, { key: "LAINNYA", name: "Asma" }]}
        value={{ DARAH_TINGGI: { text: "Amlodipine" } }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Asma" })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("checkbox", { name: "Tidak minum obat" })[0]);
    expect(onChange).toHaveBeenLastCalledWith({ DARAH_TINGGI: { none: true } });

    rerender(
      <MedicationFields
        conditions={[{ key: "DARAH_TINGGI", name: "Darah tinggi" }]}
        value={{ DARAH_TINGGI: { none: true } }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Obat untuk Darah tinggi")).toBeDisabled();
  });
});

describe("ActivityList", () => {
  it("menambah catatan dengan jam dan jenis, lalu menampilkannya urut jam", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ActivityList entries={[]} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText("Jam"), "13");
    await userEvent.click(screen.getByRole("radio", { name: "Olahraga" }));
    await userEvent.type(screen.getByLabelText("Isi catatan"), "Jalan kaki 30 menit");
    await userEvent.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    expect(onChange).toHaveBeenLastCalledWith([{ hour: 13, kind: "OLAHRAGA", text: "Jalan kaki 30 menit" }]);

    rerender(
      <ActivityList
        entries={[
          { hour: 13, kind: "OLAHRAGA", text: "Jalan kaki" },
          { hour: 7, kind: "MAKAN_MINUM", text: "Roti" },
        ]}
        onChange={onChange}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("07.00");
    expect(items[1]).toHaveTextContent("13.00");

    await userEvent.click(screen.getByRole("button", { name: "Hapus Roti" }));
    expect(onChange).toHaveBeenLastCalledWith([{ hour: 13, kind: "OLAHRAGA", text: "Jalan kaki" }]);
  });
});

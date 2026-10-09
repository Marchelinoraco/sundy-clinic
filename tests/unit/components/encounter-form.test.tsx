import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { EncounterForm, type EncounterFormProps, type SubjectiveHandle } from "@/components/admin/encounter-form";
import { emptyDraftInput, type EncounterOptions } from "@/lib/encounter";
import { discardEncounterDraft, finalizeEncounter, saveEncounterDraft } from "@/server/encounter";
import { NO_VITALS } from "../../fixtures/encounter-detail";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/encounter", () => ({
  saveEncounterDraft: vi.fn(),
  finalizeEncounter: vi.fn(),
  discardEncounterDraft: vi.fn(),
}));

const options: EncounterOptions = {
  services: [
    { id: "svc-konsul", name: "Konsultasi Dokter" },
    { id: "svc-meso", name: "Meso" },
  ],
  performers: [
    { id: "st-diane", name: "dr. Diane" },
    { id: "st-terapis", name: "Terapis A" },
  ],
  defaultServiceId: "svc-konsul",
  defaultPerformerId: "st-diane",
};

// 02.42 UTC = 10.42 WITA.
const saved = (version: string) => ({ ok: true as const, data: { version, savedAt: "2026-10-01T02:42:00.000Z" } });

function renderForm(props: Partial<EncounterFormProps> = {}, extra?: ReactNode) {
  return renderAdmin(
    <>
      <EncounterForm
        encounterId="e1"
        initialVersion="v1"
        initialDraft={emptyDraftInput()}
        options={options}
        autosaveDelayMs={50}
        retryDelaysMs={[300]}
        {...props}
      />
      {extra}
    </>,
  );
}

// Tautan di dalam aplikasi; onClick mencegah jsdom benar-benar berpindah halaman.
const appLink = (
  <Link href="/admin/pasien/p1" onClick={(event) => event.preventDefault()}>
    Data pasien
  </Link>
);

const status = () => screen.getByRole("status");

// Mengetik tanpa jeda antar-tombol: di jsdom satu ketikan pada formulir MUI ini makan ±30 ms, lebih
// lama dari jeda simpan otomatis uji (50 ms), sehingga simpan bisa terpicu di tengah kata.
const type = (element: Element, text: string) => userEvent.setup({ delay: null }).type(element, text);

describe("EncounterForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("menyimpan otomatis setelah berhenti mengetik, lalu memakai versi baru untuk simpan berikutnya", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValueOnce(saved("v2")).mockResolvedValueOnce(saved("v3"));
    renderForm();

    await type(screen.getByLabelText("Keluhan dan anamnesis dokter"), "Pusing");
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(1));
    expect(saveEncounterDraft).toHaveBeenLastCalledWith({
      encounterId: "e1",
      version: "v1",
      draft: expect.objectContaining({ subjective: "Pusing" }),
    });
    await waitFor(() => expect(status()).toHaveTextContent("Tersimpan 10.42"));

    await type(screen.getByLabelText("Keluhan dan anamnesis dokter"), "!");
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(2));
    expect(saveEncounterDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: "v2", draft: expect.objectContaining({ subjective: "Pusing!" }) }),
    );
  });

  it("ketikan selama simpan masih berjalan ikut tersimpan berikutnya dengan versi terbaru", async () => {
    let finishFirst: (value: ReturnType<typeof saved>) => void = () => {};
    vi.mocked(saveEncounterDraft)
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(saved("v3"));
    renderForm();

    const field = screen.getByLabelText("Penilaian / diagnosis");
    await type(field, "A");
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(1));
    await type(field, "B");
    finishFirst(saved("v2"));

    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(2));
    expect(saveEncounterDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: "v2", draft: expect.objectContaining({ assessment: "AB" }) }),
    );
    await waitFor(() => expect(status()).toHaveTextContent("Tersimpan"));
  });

  it("angka yang tidak sah tidak dikirim, dan pesannya tampil", async () => {
    renderForm();
    await type(screen.getByLabelText("Sistolik (mmHg)"), "12");
    await waitFor(() => expect(status()).toHaveTextContent("Belum tersimpan: Sistolik harus 50–260 mmHg."));
    expect(saveEncounterDraft).not.toHaveBeenCalled();
  });

  it("angka yang tidak sah ditandai di kolomnya, dan status tampil sebagai galat", async () => {
    renderForm();
    const systolic = screen.getByLabelText("Sistolik (mmHg)");
    await type(systolic, "12");
    await waitFor(() => expect(systolic).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Sistolik harus 50–260 mmHg.")).toBeInTheDocument();
    expect(status()).toHaveAttribute("data-tone", "error");
  });

  it("tensi yang tidak berpasangan ditandai di bagian O", async () => {
    renderForm();
    await type(screen.getByLabelText("Sistolik (mmHg)"), "120");
    await waitFor(() => expect(screen.getByText("Isi sistolik dan diastolik bersamaan.")).toBeInTheDocument());
    expect(saveEncounterDraft).not.toHaveBeenCalled();
  });

  it("galat jaringan dicoba ulang sampai tersimpan", async () => {
    vi.mocked(saveEncounterDraft).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(saved("v2"));
    renderForm();
    await type(screen.getByLabelText("Rencana, program, dan resep"), "Kontrol");
    await waitFor(() => expect(status()).toHaveTextContent("Belum tersimpan, mencoba lagi"));
    await waitFor(() => expect(status()).toHaveTextContent("Tersimpan 10.42"));
    expect(saveEncounterDraft).toHaveBeenCalledTimes(2);
  });

  it("penolakan server ditampilkan dan tidak dicoba ulang", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue({
      ok: false,
      error: "Catatan ini baru diubah di tempat lain. Muat ulang halaman.",
    });
    renderForm();
    await type(screen.getByLabelText("Pemeriksaan fisik"), "Normal");
    await waitFor(() => expect(status()).toHaveTextContent("Belum tersimpan: Catatan ini baru diubah di tempat lain."));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(saveEncounterDraft).toHaveBeenCalledTimes(1);
  });

  it("IMT dihitung dari berat dan tinggi", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    renderForm();
    expect(screen.getByText("IMT —")).toBeInTheDocument();
    await type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    await type(screen.getByLabelText("Tinggi badan (cm)"), "160");
    expect(screen.getByText("IMT 28,3")).toBeInTheDocument();
  });

  it("treatment baru memakai layanan booking dan tenaga terjadwal sebagai usulan", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Tambah treatment" }));
    const row = screen.getByRole("group", { name: "Treatment 1" });
    expect(within(row).getByLabelText("Treatment")).toHaveValue("svc-konsul");
    expect(within(row).getByLabelText("Pelaksana")).toHaveValue("st-diane");

    await userEvent.selectOptions(within(row).getByLabelText("Treatment"), "svc-meso");
    await type(within(row).getByLabelText("Area"), "Perut");
    await waitFor(() =>
      expect(saveEncounterDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({
            treatments: [{ serviceId: "svc-meso", area: "Perut", dose: "", performerId: "st-diane", notes: "" }],
          }),
        }),
      ),
    );

    await userEvent.click(within(row).getByRole("button", { name: "Hapus treatment 1" }));
    expect(screen.queryByRole("group", { name: "Treatment 1" })).not.toBeInTheDocument();
  });

  it("finalisasi tanpa penilaian ditolak sebelum dialog terbuka", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Finalisasi" }));
    expect(toast.error).toHaveBeenCalledWith("Isi penilaian (A) sebelum finalisasi.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(finalizeEncounter).not.toHaveBeenCalled();
  });

  it("finalisasi sesaat setelah mengetik mengirim isian terakhir, lalu memuat ulang halaman", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    vi.mocked(finalizeEncounter).mockResolvedValue({ ok: true, data: undefined });
    renderForm();

    await type(screen.getByLabelText("Penilaian / diagnosis"), "Obesitas");
    await userEvent.click(screen.getByRole("button", { name: "Finalisasi" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Finalisasi" }));

    await waitFor(() => expect(finalizeEncounter).toHaveBeenCalledTimes(1));
    expect(finalizeEncounter).toHaveBeenCalledWith(
      expect.objectContaining({ encounterId: "e1", draft: expect.objectContaining({ assessment: "Obesitas" }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("dialog finalisasi memperingatkan angka BIA yang diketik tetapi belum disimpan, dan tidak menghalangi finalisasi", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    vi.mocked(finalizeEncounter).mockResolvedValue({ ok: true, data: undefined });
    renderForm({ biaUnsaved: true });

    await type(screen.getByLabelText("Penilaian / diagnosis"), "Obesitas");
    await userEvent.click(screen.getByRole("button", { name: "Finalisasi" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Angka BIA yang Anda ketik belum disimpan. Kembali, buka tab BIA, lalu tekan Simpan angka BIA.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Finalisasi" }));
    await waitFor(() => expect(finalizeEncounter).toHaveBeenCalledTimes(1));
  });

  it("tanpa angka BIA yang belum disimpan, dialog finalisasi tidak menampilkan peringatan", async () => {
    renderForm({ biaUnsaved: false });
    await type(screen.getByLabelText("Penilaian / diagnosis"), "Obesitas");
    await userEvent.click(screen.getByRole("button", { name: "Finalisasi" }));
    expect(within(screen.getByRole("alertdialog")).queryByText(/Angka BIA yang Anda ketik/)).toBeNull();
  });

  it("buang draf mengirim versi terakhir lalu kembali ke dasbor", async () => {
    vi.mocked(discardEncounterDraft).mockResolvedValue({ ok: true, data: undefined });
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Buang draf" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Buang draf" }));
    await waitFor(() => expect(discardEncounterDraft).toHaveBeenCalledWith({ encounterId: "e1", version: "v1" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
  });

  it("ketikan terakhir tetap dikirim saat formulir ditinggalkan lewat navigasi di dalam aplikasi", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    const { unmount } = renderForm({ autosaveDelayMs: 10_000 });
    await type(screen.getByLabelText("Penilaian / diagnosis"), "Obesitas");
    expect(saveEncounterDraft).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(1));
    expect(saveEncounterDraft).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v1", draft: expect.objectContaining({ assessment: "Obesitas" }) }),
    );
  });

  it("setelah formulir ditinggalkan, simpan yang gagal tidak dicoba ulang terus-menerus", async () => {
    vi.mocked(saveEncounterDraft).mockRejectedValue(new Error("offline"));
    const { unmount } = renderForm({ autosaveDelayMs: 10_000, retryDelaysMs: [20] });
    await type(screen.getByLabelText("Rencana, program, dan resep"), "Kontrol");
    unmount();
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(saveEncounterDraft).toHaveBeenCalledTimes(1);
  });

  it("tautan di dalam aplikasi meminta konfirmasi selama ada perubahan yang tidak bisa disimpan", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderForm({}, appLink);
    await type(screen.getByLabelText("Sistolik (mmHg)"), "12");
    await waitFor(() => expect(status()).toHaveTextContent("Belum tersimpan"));

    fireEvent.click(screen.getByRole("link", { name: "Data pasien" }));
    expect(confirm).toHaveBeenCalledWith("Ada perubahan yang belum tersimpan. Tinggalkan halaman ini?");
    confirm.mockRestore();
  });

  it("tautan tidak meminta konfirmasi bila tidak ada perubahan yang tertahan", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderForm({}, appLink);
    fireEvent.click(screen.getByRole("link", { name: "Data pasien" }));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("baris IMT menyebut selisih berat dari kunjungan final terakhir yang ditimbang", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValue(saved("v2"));
    renderForm({ weightHistory: [{ date: new Date("2026-09-23T03:00:00Z"), vitals: { ...NO_VITALS, weightKg: 73.3 } }] });
    await type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    await type(screen.getByLabelText("Tinggi badan (cm)"), "158");
    expect(screen.getByText("IMT 29 · berat turun 0,8 kg dari Rab, 23 Sep")).toBeInTheDocument();
  });

  it("memberi tahu angka vital terbaru saat mengetik, dengan isian tidak sah sebagai null", async () => {
    const onVitalsChange = vi.fn();
    renderForm({ onVitalsChange });
    await type(screen.getByLabelText("Berat badan (kg)"), "72,5");
    expect(onVitalsChange).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: 72.5, systolic: null }));
    await type(screen.getByLabelText("Sistolik (mmHg)"), "1");
    expect(onVitalsChange).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: 72.5, systolic: null }));
  });

  it("Finalisasi dan status simpan berada di bar bawah yang menempel", () => {
    renderForm();
    const bar = screen.getByRole("button", { name: "Finalisasi" }).closest("[data-slot='encounter-actions']");
    expect(bar).toHaveStyle({ position: "sticky", bottom: "0px" });
    expect(bar).toContainElement(screen.getByRole("status"));
  });

  it("ada kolom Catatan untuk Apoteker di bagian Plan, dan ketikan ikut tersimpan otomatis", async () => {
    vi.mocked(saveEncounterDraft).mockResolvedValueOnce(saved("v2"));
    renderForm();
    const field = screen.getByLabelText("Catatan untuk Apoteker");
    expect(field).toHaveAttribute("maxlength", "1000");
    await type(field, "Amoxicillin 3x1");
    expect(field).toHaveValue("Amoxicillin 3x1");
    await waitFor(() => expect(saveEncounterDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveEncounterDraft).mock.calls[0][0].draft.pharmacyNote).toBe("Amoxicillin 3x1");
  });
});

describe("EncounterForm: menambah ke S dari tab food recall", () => {
  it("menambahkan di akhir S dan menolak bila melebihi 5.000 karakter", () => {
    const ref = createRef<SubjectiveHandle>();
    renderForm({ initialDraft: { ...emptyDraftInput(), subjective: "BB naik" }, subjectiveRef: ref });
    const field = screen.getByLabelText("Keluhan dan anamnesis dokter");

    let accepted = false;
    act(() => {
      accepted = ref.current!.append("Food recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi");
    });
    expect(accepted).toBe(true);
    expect(field).toHaveValue("BB naik\n\nFood recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi");
    expect(ref.current!.text()).toContain("Food recall H-1 (Rabu, 30 Sep)");

    act(() => {
      accepted = ref.current!.append("x".repeat(5000));
    });
    expect(accepted).toBe(false);
    expect(field).toHaveValue("BB naik\n\nFood recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi");
  });
});

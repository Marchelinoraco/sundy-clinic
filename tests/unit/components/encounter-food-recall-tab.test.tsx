import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncounterFoodRecallTab, type SubjectiveCopy } from "@/components/admin/encounter-food-recall-tab";
import type { FoodRecallView } from "@/lib/food-recall";
import { saveFoodRecallByStaff } from "@/server/food-recall-admin";
import { renderAdmin } from "../helpers/render-admin";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/food-recall-admin", () => ({
  saveFoodRecallByStaff: vi.fn(),
  getFoodRecallLink: vi.fn().mockResolvedValue({ ok: true, data: { state: "NOT_OFFERED" } }),
  offerFoodRecall: vi.fn(),
}));

const FILLED: FoodRecallView = {
  appointmentId: "a1",
  state: "FILLED",
  recallDate: "2026-09-30",
  recallDateLabel: "Rabu, 30 September",
  entries: [
    { hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning", by: "CUSTOMER" },
    { hour: 9, kind: "OLAHRAGA", text: "Senam", by: "DOKTER" },
  ],
  submittedAt: new Date("2026-10-01T02:30:00Z"),
  completedAt: new Date("2026-10-01T03:00:00Z"),
  completedByName: "dr. Diane",
  version: "2026-10-01T03:00:00.000Z",
};

function copyStub(has = false, append = true): SubjectiveCopy {
  return { has: vi.fn().mockReturnValue(has), append: vi.fn().mockReturnValue(append) };
}

function renderTab(props: Partial<Parameters<typeof EncounterFoodRecallTab>[0]> = {}) {
  return renderAdmin(
    <EncounterFoodRecallTab foodRecall={FILLED} appointmentCode="SDY-8F3K" patientName="Siti Rahayu" editable copy={copyStub()} {...props} />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("EncounterFoodRecallTab", () => {
  it("menampilkan tabel per jam dengan penulis tiap baris", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Kemarin, Rabu, 30 September" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Recall Rabu, 30 September" });
    expect(within(table).getByText("Nasi kuning")).toBeInTheDocument();
    expect(within(table).getByText("pasien")).toBeInTheDocument();
    expect(within(table).getByText("dokter")).toBeInTheDocument();
    expect(screen.getByText(/Dilengkapi dr\. Diane/)).toBeInTheDocument();
  });

  it("Salin ke S menambahkan ringkasan; salinan kedua meminta konfirmasi", async () => {
    const user = userEvent.setup();
    const copy = copyStub(false);
    const { unmount } = renderTab({ copy });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(copy.append).toHaveBeenCalledWith(
      "Recall H-1 (Rabu, 30 Sep):\n07.00 Makan/minum — Nasi kuning\n09.00 Olahraga — Senam",
    );
    expect(toast.success).toHaveBeenCalledWith("Recall disalin ke S.");
    unmount();

    const again = copyStub(true);
    renderTab({ copy: again });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(again.append).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Salin lagi" }));
    expect(again.append).toHaveBeenCalledTimes(1);
  });

  it("tidak memotong S diam-diam bila akan melebihi batas", async () => {
    const user = userEvent.setup();
    renderTab({ copy: copyStub(false, false) });
    await user.click(screen.getByRole("button", { name: "Salin ke S" }));
    expect(toast.error).toHaveBeenCalledWith("Kolom S akan melebihi 5.000 karakter. Ringkas S dulu, lalu salin lagi.");
  });

  it("catatan final: tabel saja, tanpa Salin ke S dan Lengkapi", () => {
    renderTab({ editable: false, copy: undefined });
    expect(screen.getByText("Nasi kuning")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salin ke S" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lengkapi" })).not.toBeInTheDocument();
  });

  it("Lengkapi: baris customer tetap, baris baru dikirim tanpa penanda lalu disimpan", async () => {
    const user = userEvent.setup();
    vi.mocked(saveFoodRecallByStaff).mockResolvedValue({ ok: true, data: undefined });
    renderTab({ foodRecall: { ...FILLED, entries: [FILLED.entries[0]] } });
    await user.click(screen.getByRole("button", { name: "Lengkapi" }));
    await user.type(screen.getByLabelText("Isi catatan"), "Teh tawar");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: "Simpan recall" }));
    await waitFor(() =>
      expect(saveFoodRecallByStaff).toHaveBeenCalledWith({
        appointmentId: "a1",
        entries: [FILLED.entries[0], { hour: 7, kind: "MAKAN_MINUM", text: "Teh tawar" }],
        baseVersion: "2026-10-01T03:00:00.000Z",
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("belum diisi: pesan, buka QR dan link, atau isi sendiri", async () => {
    const user = userEvent.setup();
    renderTab({ foodRecall: { ...FILLED, state: "WAITING", entries: [], submittedAt: null, completedAt: null } });
    expect(screen.getByText("Customer belum mengisi recall.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Isi sendiri" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Buka QR dan link" }));
    expect(await screen.findByRole("dialog", { name: "Recall — SDY-8F3K" })).toBeInTheDocument();
  });

  it("tidak ditawarkan saat check-in: bisa ditawarkan sekarang", () => {
    renderTab({ foodRecall: { ...FILLED, state: "NOT_OFFERED", entries: [], submittedAt: null, completedAt: null } });
    expect(screen.getByText("Recall tidak ditawarkan saat check-in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tawarkan sekarang" })).toBeInTheDocument();
  });

  it("lima jenis catatan, Bangun tidur tanpa isi, dan tabel tanpa titik dua untuk baris tanpa isi (spec recall)", async () => {
    const user = userEvent.setup();
    vi.mocked(saveFoodRecallByStaff).mockResolvedValue({ ok: true, data: undefined });
    renderTab({ foodRecall: { ...FILLED, entries: [{ hour: 13, kind: "ISTIRAHAT", text: "Tidur siang", by: "CUSTOMER" }, { hour: 5, kind: "BANGUN_TIDUR", text: "", by: "PERAWAT" }] } });
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Bangun tidur");
    expect(table).not.toHaveTextContent("Bangun tidur:");
    expect(table).toHaveTextContent("Istirahat: Tidur siang");

    await user.click(screen.getByRole("button", { name: "Lengkapi" }));
    const kinds = within(screen.getByRole("radiogroup", { name: "Jenis catatan" })).getAllByRole("radio");
    expect(kinds.map((radio) => radio.closest("label")?.textContent)).toEqual(["Makan/minum", "Kapsul/obat", "Olahraga", "Bangun tidur", "Istirahat"]);
    const hour = screen.getByLabelText("Jam");
    expect(within(hour).getByRole("option", { name: "00.00" })).toBeInTheDocument();
    expect(within(hour).getByRole("option", { name: "23.00" })).toBeInTheDocument();
    await user.selectOptions(hour, "23");
    await user.click(screen.getByRole("radio", { name: "Bangun tidur" }));
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: /^Simpan (food )?recall$/i }));
    await waitFor(() =>
      expect(saveFoodRecallByStaff).toHaveBeenCalledWith(
        expect.objectContaining({ entries: expect.arrayContaining([{ hour: 23, kind: "BANGUN_TIDUR", text: "" }]) }),
      ),
    );
  });

  it("tombol jam kosong menyebut rentang 00.00–23.00 (temuan review recall)", async () => {
    const user = userEvent.setup();
    renderTab({ foodRecall: { ...FILLED, entries: [{ hour: 5, kind: "BANGUN_TIDUR", text: "", by: "PERAWAT" }] } });
    await user.click(screen.getByRole("button", { name: "Tampilkan 00.00–23.00" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("00.00");
    expect(rows.at(-1)).toHaveTextContent("23.00");
  });

  it("halaman perawat: tanpa link pasien, mengisi dari kosong, dan memakai aksi simpan perawat", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    renderTab({ foodRecall: { ...FILLED, state: "NOT_OFFERED", entries: [], submittedAt: null, completedAt: null, completedByName: null, version: null }, copy: undefined, customerLink: false, save });
    expect(screen.getByText("Belum ada recall.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tawarkan sekarang" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Buka QR dan link" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Isi recall" }));
    await user.type(screen.getByLabelText("Isi catatan"), "Nasi uduk");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: "Simpan recall" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ appointmentId: "a1", entries: [expect.objectContaining({ text: "Nasi uduk" })], baseVersion: null }));
    expect(saveFoodRecallByStaff).not.toHaveBeenCalled();
  });
});

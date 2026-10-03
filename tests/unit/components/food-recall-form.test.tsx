import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FoodRecallEntry } from "@/components/food-recall/food-recall-entry";
import { FOOD_RECALL_CLOSED, FOOD_RECALL_RECEIVED } from "@/lib/food-recall";
import { getFoodRecallPage, submitFoodRecall } from "@/server/food-recall-public";

vi.mock("@/server/food-recall-public", () => ({ getFoodRecallPage: vi.fn(), submitFoodRecall: vi.fn() }));

const OPEN = { state: "OPEN" as const, firstName: "Siti", recallDateLabel: "Jumat, 2 Oktober" };

function openWithCode(code: string) {
  window.history.replaceState(null, "", `/food-recall#${code}`);
  render(<FoodRecallEntry />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFoodRecallPage).mockResolvedValue({ ok: true, data: OPEN });
  vi.mocked(submitFoodRecall).mockResolvedValue({ ok: true, data: { state: "SUBMITTED" } });
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("halaman food recall customer", () => {
  it("membaca kode dari # dan menyapa dengan nama depan serta tanggal kemarin", async () => {
    openWithCode("kode-uji");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Apa saja yang Anda makan, minum, dan lakukan kemarin, Jumat, 2 Oktober?",
    );
    expect(screen.getByText("Halo Siti,")).toBeInTheDocument();
    expect(getFoodRecallPage).toHaveBeenCalledWith("kode-uji");
    expect(document.body.textContent).not.toMatch(/pasien|berobat/i);
  });

  it("Kirim baru aktif setelah ada catatan, lalu mengirim baris yang ditambahkan", async () => {
    const user = userEvent.setup();
    openWithCode("kode-uji");
    const send = await screen.findByRole("button", { name: "Kirim" });
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText("Isi catatan"), "Nasi kuning");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(send);

    await waitFor(() =>
      expect(submitFoodRecall).toHaveBeenCalledWith({
        code: "kode-uji",
        entries: [{ hour: 7, kind: "MAKAN_MINUM", text: "Nasi kuning" }],
        website: "",
      }),
    );
  });

  it("tablet bersama: layar terima kasih tanpa isian, Selesai membuang kode, tanpa simpanan di perangkat", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    openWithCode("kode-uji");
    await user.type(await screen.findByLabelText("Isi catatan"), "Nasi kuning");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));

    expect(await screen.findByText("Terima kasih, dokter akan melihatnya saat konsultasi.")).toBeInTheDocument();
    expect(screen.queryByText("Nasi kuning")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Selesai" }));
    expect(window.location.hash).toBe("");
    expect(screen.getByText("Buka link dari klinik untuk mengisi catatan ini.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Nasi kuning");
    expect(document.body.textContent).not.toContain("Siti");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("menampilkan pesan dari server bila kiriman ditolak", async () => {
    const user = userEvent.setup();
    vi.mocked(submitFoodRecall).mockResolvedValue({ ok: false, error: FOOD_RECALL_RECEIVED });
    openWithCode("kode-uji");
    await user.type(await screen.findByLabelText("Isi catatan"), "Teh manis");
    await user.click(screen.getByRole("button", { name: "＋ Tambah catatan" }));
    await user.click(screen.getByRole("button", { name: "Kirim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FOOD_RECALL_RECEIVED);
  });

  it("link yang tidak berlaku atau sudah diterima dokter", async () => {
    vi.mocked(getFoodRecallPage).mockResolvedValueOnce({ ok: true, data: { state: "CLOSED" } });
    openWithCode("kode-lama");
    expect(await screen.findByText(FOOD_RECALL_CLOSED)).toBeInTheDocument();
  });

  it("food recall yang sudah diterima dokter", async () => {
    vi.mocked(getFoodRecallPage).mockResolvedValueOnce({ ok: true, data: { state: "RECEIVED" } });
    openWithCode("kode-diterima");
    expect(await screen.findByText(FOOD_RECALL_RECEIVED)).toBeInTheDocument();
  });

  it("tanpa kode: meminta link dari klinik tanpa memanggil server", () => {
    window.history.replaceState(null, "", "/food-recall");
    render(<FoodRecallEntry />);
    expect(screen.getByText("Buka link dari klinik untuk mengisi catatan ini.")).toBeInTheDocument();
    expect(getFoodRecallPage).not.toHaveBeenCalled();
  });
});

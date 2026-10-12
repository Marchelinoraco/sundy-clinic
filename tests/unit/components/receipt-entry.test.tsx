import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptEntry } from "@/components/receipt/receipt-entry";
import { getPublicReceipt } from "@/server/receipt-public";
import { RECEIPT } from "../../fixtures/receipt";

vi.mock("@/server/receipt-public", () => ({ getPublicReceipt: vi.fn() }));

function openWithHash(hash: string) {
  window.history.replaceState(null, "", `/struk${hash}`);
  render(<ReceiptEntry />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => window.history.replaceState(null, "", "/"));

describe("ReceiptEntry", () => {
  it("membaca kode dari # lalu menampilkan struk dan tombol Cetak", async () => {
    vi.mocked(getPublicReceipt).mockResolvedValue({ ok: true, data: { state: "VALID", receipt: RECEIPT } });
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    openWithHash("#kode%2Euji");
    expect(await screen.findByRole("region", { name: "Struk TG-2026-0123" })).toBeInTheDocument();
    expect(getPublicReceipt).toHaveBeenCalledWith("kode.uji");
    await userEvent.setup().click(screen.getByRole("button", { name: "Cetak" }));
    expect(print).toHaveBeenCalled();
  });

  it("tanpa kode: tidak berlaku, tanpa memanggil server", async () => {
    openWithHash("");
    expect(await screen.findByText("Tautan struk tidak berlaku.")).toBeInTheDocument();
    expect(getPublicReceipt).not.toHaveBeenCalled();
  });

  it("dibatalkan dan tidak berlaku", async () => {
    vi.mocked(getPublicReceipt).mockResolvedValueOnce({ ok: true, data: { state: "CANCELLED" } });
    openWithHash("#a");
    expect(await screen.findByText("Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan.")).toBeInTheDocument();
  });

  it("pembatas laju dan galat jaringan menampilkan pesannya", async () => {
    vi.mocked(getPublicReceipt).mockResolvedValueOnce({ ok: false, error: "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi." });
    openWithHash("#a");
    expect(await screen.findByText("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.")).toBeInTheDocument();
  });

  it("galat jaringan", async () => {
    vi.mocked(getPublicReceipt).mockRejectedValueOnce(new Error("jaringan"));
    openWithHash("#a");
    expect(await screen.findByText("Struk gagal dimuat. Periksa koneksi lalu muat ulang halaman ini.")).toBeInTheDocument();
  });
});

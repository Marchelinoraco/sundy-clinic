import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceEntry } from "@/components/receipt/invoice-entry";
import { getPublicInvoice } from "@/server/invoice-a4-public";
import { INVOICE_A4 } from "../../fixtures/invoice-a4";

vi.mock("@/server/invoice-a4-public", () => ({ getPublicInvoice: vi.fn() }));

function openWithHash(hash: string) {
  window.history.replaceState(null, "", `/invoice${hash}`);
  render(<InvoiceEntry />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => window.history.replaceState(null, "", "/"));

describe("InvoiceEntry (spec invoice A4 IA8, IA9)", () => {
  it("membaca kode dari # lalu menampilkan invoice A4, tombol Cetak, dan tautan kembali ke struk", async () => {
    vi.mocked(getPublicInvoice).mockResolvedValue({ ok: true, data: { state: "VALID", invoice: INVOICE_A4 } });
    openWithHash("#kode%2Euji");
    expect(await screen.findByRole("region", { name: "Invoice TG-2026-0123" })).toBeInTheDocument();
    expect(getPublicInvoice).toHaveBeenCalledWith("kode.uji");
    expect(screen.getByRole("button", { name: "Cetak atau simpan PDF" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat struk" })).toHaveAttribute("href", "/struk#kode.uji");
  });

  it("dibatalkan dan tanpa kode memakai pesan struk", async () => {
    vi.mocked(getPublicInvoice).mockResolvedValueOnce({ ok: true, data: { state: "CANCELLED" } });
    openWithHash("#a");
    expect(await screen.findByText("Struk ini sudah dibatalkan. Hubungi klinik bila ada pertanyaan.")).toBeInTheDocument();
  });
});

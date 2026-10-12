import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicePaymentDialog } from "@/components/admin/billing/invoice-payment-dialog";
import { recordInvoicePayment } from "@/server/invoice-payments";
import { renderAdmin } from "../helpers/render-admin";

vi.mock("@/server/invoice-payments", () => ({ recordInvoicePayment: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ACCOUNTS = [
  { id: "a", bankName: "BCA", accountNumber: "123", accountHolder: "SunDY", isActive: true, sortOrder: 0, label: "BCA 123 a.n. SunDY" },
  { id: "b", bankName: "BRI", accountNumber: "456", accountHolder: "SunDY", isActive: true, sortOrder: 1, label: "BRI 456 a.n. SunDY" },
];

function open(bankAccounts = ACCOUNTS) {
  renderAdmin(<InvoicePaymentDialog invoiceId="inv1" limit={300_000} finalizedDate="2026-10-12" today="2026-10-13" bankAccounts={bankAccounts} />);
}

beforeEach(() => vi.clearAllMocks());

describe("InvoicePaymentDialog transfer", () => {
  it("isian transfer hanya muncul untuk Transfer bank, dan terkirim lengkap", async () => {
    vi.mocked(recordInvoicePayment).mockResolvedValue({ ok: true, data: { id: "p1" } });
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pembayaran" });
    expect(within(dialog).queryByLabelText("Rekening tujuan")).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Metode"), "TRANSFER");
    await user.selectOptions(within(dialog).getByLabelText("Rekening tujuan"), "b");
    await user.type(within(dialog).getByLabelText("Bank pengirim (opsional)"), "Mandiri");
    await user.type(within(dialog).getByLabelText("Nama pemilik rekening pengirim (opsional)"), "Budi");
    await user.type(within(dialog).getByLabelText("Nomor rekening pengirim (opsional)"), "****9876");
    await user.type(within(dialog).getByLabelText("Nomor referensi (opsional)"), "REF9");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(recordInvoicePayment).toHaveBeenCalledWith(
        expect.objectContaining({ method: "TRANSFER", clinicBankAccountId: "b", senderBank: "Mandiri", senderAccountName: "Budi", senderAccountNumber: "****9876", reference: "REF9" }),
      ),
    );
  });

  it("satu rekening: sudah terpilih; tanpa rekening: pesan dan tidak bisa disimpan", async () => {
    const user = userEvent.setup();
    open([ACCOUNTS[0]]);
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pembayaran" });
    await user.selectOptions(within(dialog).getByLabelText("Metode"), "TRANSFER");
    expect(within(dialog).getByLabelText("Rekening tujuan")).toHaveValue("a");
  });

  it("tanpa rekening klinik aktif: Transfer bank tidak bisa disimpan", async () => {
    const user = userEvent.setup();
    open([]);
    await user.click(screen.getByRole("button", { name: "Catat pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat pembayaran" });
    await user.selectOptions(within(dialog).getByLabelText("Metode"), "TRANSFER");
    expect(within(dialog).getByText("Belum ada rekening klinik. Tambahkan di Pengaturan.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
});

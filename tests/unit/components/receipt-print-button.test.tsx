import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptPrintButton } from "@/components/admin/billing/receipt-print-button";
import { listPrinters, loadPrinterSettings, printRaw, PrinterError, savePrinterSettings } from "@/components/admin/billing/receipt-printer";
import { recordReceiptPrint } from "@/server/receipt";
import { toast } from "sonner";
import { renderAdmin } from "../helpers/render-admin";
import { RECEIPT } from "../../fixtures/receipt";

vi.mock("@/server/receipt", () => ({ recordReceiptPrint: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/admin/billing/receipt-printer", async () => {
  const actual = await vi.importActual<typeof import("@/components/admin/billing/receipt-printer")>("@/components/admin/billing/receipt-printer");
  return { ...actual, listPrinters: vi.fn(), printRaw: vi.fn(), loadPrinterSettings: vi.fn(), savePrinterSettings: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPrinters).mockResolvedValue(["EPSON TM-T82"]);
  vi.mocked(printRaw).mockResolvedValue();
  vi.mocked(recordReceiptPrint).mockResolvedValue({ ok: true, data: undefined });
});

describe("ReceiptPrintButton", () => {
  it("belum diatur: pengaturan dulu, lalu mencetak ke printer pilihan dan mencatat audit", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue(null);
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    const dialog = await screen.findByRole("dialog", { name: "Pengaturan printer struk" });
    await waitFor(() => expect(within(dialog).getByLabelText("Printer")).toHaveValue("EPSON TM-T82"));
    await user.selectOptions(within(dialog).getByLabelText("Lebar kertas"), "58");
    await user.click(within(dialog).getByRole("button", { name: "Simpan dan cetak" }));
    await waitFor(() => expect(printRaw).toHaveBeenCalledTimes(1));
    expect(savePrinterSettings).toHaveBeenCalledWith({ printer: "EPSON TM-T82", width: 58 });
    const [printer, data] = vi.mocked(printRaw).mock.calls[0];
    expect(printer).toBe("EPSON TM-T82");
    expect(data).toContain("TG-2026-0123");
    expect(recordReceiptPrint).toHaveBeenCalledWith("inv1");
    expect(toast.success).toHaveBeenCalledWith("Struk dicetak.");
  });

  it("sudah diatur: langsung mencetak tanpa dialog", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue({ printer: "EPSON TM-T82", width: 80 });
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    await waitFor(() => expect(printRaw).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("QZ Tray tidak tersambung: pesan jelas, tombol tetap bisa dipakai", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue({ printer: "EPSON TM-T82", width: 80 });
    vi.mocked(printRaw).mockRejectedValueOnce(new PrinterError("NOT_CONNECTED", "x"));
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi.");
    expect(screen.getByRole("button", { name: "Cetak struk" })).toBeEnabled();
    expect(recordReceiptPrint).not.toHaveBeenCalled();
  });

  it("printer tersimpan hilang: pesan menyebut namanya dan dialog pengaturan terbuka", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue({ printer: "Printer Lama", width: 80 });
    vi.mocked(printRaw).mockRejectedValueOnce(new PrinterError("PRINTER_MISSING", "x"));
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    expect(await screen.findByRole("dialog", { name: "Pengaturan printer struk" })).toHaveTextContent("Printer «Printer Lama» tidak ditemukan. Pilih printer lagi.");
  });

  it("gagal cetak: pesan QZ Tray ditampilkan apa adanya", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue({ printer: "EPSON TM-T82", width: 80 });
    vi.mocked(printRaw).mockRejectedValueOnce(new PrinterError("PRINT_FAILED", "Kertas habis"));
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Cetak struk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kertas habis");
  });

  it("dialog pengaturan: QZ Tray tidak tersambung saat memuat daftar printer", async () => {
    vi.mocked(loadPrinterSettings).mockReturnValue(null);
    vi.mocked(listPrinters).mockRejectedValueOnce(new PrinterError("NOT_CONNECTED", "x"));
    const user = userEvent.setup();
    renderAdmin(<ReceiptPrintButton invoiceId="inv1" receipt={RECEIPT} />);
    await user.click(screen.getByRole("button", { name: "Pengaturan printer" }));
    const dialog = await screen.findByRole("dialog", { name: "Pengaturan printer struk" });
    expect(await within(dialog).findByText("QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi.")).toBeInTheDocument();
  });
});

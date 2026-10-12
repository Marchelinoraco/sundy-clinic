import { beforeEach, describe, expect, it, vi } from "vitest";

const qz = vi.hoisted(() => ({
  websocket: { isActive: vi.fn(() => false), connect: vi.fn(async () => {}) },
  security: { setCertificatePromise: vi.fn(), setSignatureAlgorithm: vi.fn(), setSignaturePromise: vi.fn() },
  printers: { find: vi.fn(async () => ["EPSON TM-T82", "Microsoft Print to PDF"]) },
  configs: { create: vi.fn((printer: string) => ({ printer })) },
  print: vi.fn(async () => {}),
}));
vi.mock("qz-tray", () => ({ default: qz }));

import { listPrinters, loadPrinterSettings, printRaw, PrinterError, PRINTER_SETTINGS_KEY, savePrinterSettings } from "@/components/admin/billing/receipt-printer";

beforeEach(() => {
  vi.clearAllMocks();
  qz.websocket.isActive.mockReturnValue(false);
  window.localStorage.clear();
});

describe("pengaturan printer per komputer", () => {
  it("tersimpan di localStorage dan dibaca lagi; isi rusak dianggap belum diatur", () => {
    expect(loadPrinterSettings()).toBeNull();
    savePrinterSettings({ printer: "EPSON TM-T82", width: 58 });
    expect(loadPrinterSettings()).toEqual({ printer: "EPSON TM-T82", width: 58 });
    window.localStorage.setItem(PRINTER_SETTINGS_KEY, "{rusak");
    expect(loadPrinterSettings()).toBeNull();
    window.localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify({ printer: "X", width: 70 }));
    expect(loadPrinterSettings()).toBeNull();
  });
});

describe("QZ Tray", () => {
  it("menyambung sekali dengan sertifikat dan tanda tangan SHA512 dari rute panel", async () => {
    expect(await listPrinters()).toEqual(["EPSON TM-T82", "Microsoft Print to PDF"]);
    expect(qz.security.setSignatureAlgorithm).toHaveBeenCalledWith("SHA512");
    expect(qz.websocket.connect).toHaveBeenCalledTimes(1);
  });

  it("QZ Tray tidak berjalan → NOT_CONNECTED", async () => {
    qz.websocket.connect.mockRejectedValueOnce(new Error("Unable to establish connection"));
    await expect(listPrinters()).rejects.toMatchObject({ kind: "NOT_CONNECTED" });
  });

  it("mencetak data mentah ke printer yang ada", async () => {
    await printRaw("EPSON TM-T82", "DATA");
    expect(qz.configs.create).toHaveBeenCalledWith("EPSON TM-T82");
    expect(qz.print).toHaveBeenCalledWith({ printer: "EPSON TM-T82" }, [{ type: "raw", format: "command", flavor: "plain", data: "DATA" }]);
  });

  it("printer tersimpan sudah tidak ada → PRINTER_MISSING; gagal cetak → PRINT_FAILED dengan pesannya", async () => {
    await expect(printRaw("Printer Lama", "DATA")).rejects.toMatchObject({ kind: "PRINTER_MISSING" });
    qz.print.mockRejectedValueOnce(new Error("Kertas habis"));
    const error = await printRaw("EPSON TM-T82", "DATA").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrinterError);
    expect(error).toMatchObject({ kind: "PRINT_FAILED", message: "Kertas habis" });
  });
});

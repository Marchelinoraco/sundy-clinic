import type { PaperWidth } from "@/lib/receipt-escpos";

// Cetak struk lewat QZ Tray (spec struk WA 7). Pustakanya dimuat hanya saat dibutuhkan.

export type PrinterSettings = { printer: string; width: PaperWidth };
export const PRINTER_SETTINGS_KEY = "sundy:printer-struk";

export class PrinterError extends Error {
  constructor(
    readonly kind: "NOT_CONNECTED" | "PRINTER_MISSING" | "PRINT_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "PrinterError";
  }
}

/** Pengaturan per komputer kasir; null bila belum diatur, rusak, atau penyimpanan browser tidak bisa dipakai. */
export function loadPrinterSettings(): PrinterSettings | null {
  try {
    const raw = window.localStorage.getItem(PRINTER_SETTINGS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PrinterSettings>;
    return typeof value.printer === "string" && value.printer && (value.width === 58 || value.width === 80)
      ? { printer: value.printer, width: value.width }
      : null;
  } catch {
    return null;
  }
}

export function savePrinterSettings(settings: PrinterSettings): void {
  try {
    window.localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Penyimpanan browser ditolak: kasir akan diminta memilih printer lagi lain kali.
  }
}

/** Teks dari rute panel; string kosong bila tidak tersedia, sehingga QZ Tray memakai mode tanpa tanda tangan. */
async function fetchText(url: string, init?: RequestInit): Promise<string> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  }
}

let configured = false;

async function connectedQz() {
  const qz = (await import("qz-tray")).default;
  if (!configured) {
    qz.security.setCertificatePromise((resolve) => void fetchText("/admin/qz/sertifikat").then(resolve));
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((toSign) => (resolve) =>
      void fetchText("/admin/qz/tanda-tangan", { method: "POST", headers: { "content-type": "text/plain" }, body: toSign }).then(resolve),
    );
    configured = true;
  }
  if (!qz.websocket.isActive()) {
    try {
      await qz.websocket.connect({ retries: 0, delay: 0 });
    } catch (error) {
      throw new PrinterError("NOT_CONNECTED", error instanceof Error ? error.message : String(error));
    }
  }
  return qz;
}

export async function listPrinters(): Promise<string[]> {
  const qz = await connectedQz();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : [found];
}

export async function printRaw(printer: string, data: string): Promise<void> {
  const qz = await connectedQz();
  const printers = await listPrinters();
  if (!printers.includes(printer)) throw new PrinterError("PRINTER_MISSING", printer);
  try {
    await qz.print(qz.configs.create(printer), [{ type: "raw", format: "command", flavor: "plain", data }]);
  } catch (error) {
    throw new PrinterError("PRINT_FAILED", error instanceof Error ? error.message : String(error));
  }
}

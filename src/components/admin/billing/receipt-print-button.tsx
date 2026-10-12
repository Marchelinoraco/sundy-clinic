"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { useState } from "react";
import { toast } from "sonner";
import type { PublicReceipt } from "@/lib/receipt";
import { buildEscPosReceipt } from "@/lib/receipt-escpos";
import { recordReceiptPrint } from "@/server/receipt";
import { PrinterSettingsDialog, QZ_NOT_CONNECTED } from "./printer-settings-dialog";
import { loadPrinterSettings, PrinterError, printRaw, savePrinterSettings, type PrinterSettings } from "./receipt-printer";

/** "Cetak struk" ke printer thermal lewat QZ Tray (spec struk WA 7.1). */
export function ReceiptPrintButton({ invoiceId, receipt }: { invoiceId: string; receipt: PublicReceipt }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ printAfterSave: boolean; notice: string | null } | null>(null);

  async function print(settings: PrinterSettings) {
    setBusy(true);
    setError(null);
    try {
      await printRaw(settings.printer, buildEscPosReceipt(receipt, settings.width));
      toast.success("Struk dicetak.");
      // Catatan audit saja; struk sudah tercetak walau pencatatan gagal.
      void recordReceiptPrint(invoiceId).catch(() => undefined);
    } catch (cause) {
      if (cause instanceof PrinterError && cause.kind === "PRINTER_MISSING") {
        setDialog({ printAfterSave: true, notice: `Printer «${settings.printer}» tidak ditemukan. Pilih printer lagi.` });
      } else if (cause instanceof PrinterError && cause.kind === "NOT_CONNECTED") {
        setError(QZ_NOT_CONNECTED);
      } else {
        setError(cause instanceof Error ? cause.message : "Struk gagal dicetak.");
      }
    } finally {
      setBusy(false);
    }
  }

  function start() {
    const settings = loadPrinterSettings();
    if (settings) void print(settings);
    else setDialog({ printAfterSave: true, notice: null });
  }

  return (
    <>
      <Button type="button" variant="contained" disabled={busy} onClick={start}>
        {busy ? "Mencetak…" : "Cetak struk"}
      </Button>
      <Button type="button" variant="text" size="small" onClick={() => setDialog({ printAfterSave: false, notice: null })}>
        Pengaturan printer
      </Button>
      {error && (
        <Alert severity="error" sx={{ width: "100%" }}>
          {error}
        </Alert>
      )}
      <PrinterSettingsDialog
        open={dialog !== null}
        notice={dialog?.notice}
        saveLabel={dialog?.printAfterSave ? "Simpan dan cetak" : "Simpan"}
        onClose={() => setDialog(null)}
        onSaved={(settings) => {
          savePrinterSettings(settings);
          const printAfterSave = dialog?.printAfterSave ?? false;
          setDialog(null);
          if (printAfterSave) void print(settings);
          else toast.success("Pengaturan printer disimpan.");
        }}
      />
    </>
  );
}

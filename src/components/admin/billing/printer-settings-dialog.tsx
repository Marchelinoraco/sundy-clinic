"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { PaperWidth } from "@/lib/receipt-escpos";
import { SelectField } from "../mui/select-field";
import { listPrinters, loadPrinterSettings, PrinterError, type PrinterSettings } from "./receipt-printer";

export const QZ_NOT_CONNECTED = "QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi.";

/** Printer dan lebar kertas untuk komputer ini (spec struk WA 7.1). */
export function PrinterSettingsDialog({
  open,
  notice,
  saveLabel,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Pesan di atas isian, mis. printer tersimpan tidak ditemukan. */
  notice?: string | null;
  saveLabel: string;
  onClose: () => void;
  onSaved: (settings: PrinterSettings) => void;
}) {
  const [printers, setPrinters] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printer, setPrinter] = useState("");
  const [width, setWidth] = useState<PaperWidth>(80);

  useEffect(() => {
    if (!open) return;
    let current = true;
    const saved = loadPrinterSettings();
    setPrinters(null);
    setError(null);
    setWidth(saved?.width ?? 80);
    listPrinters()
      .then((found) => {
        if (!current) return;
        setPrinters(found);
        setPrinter(saved && found.includes(saved.printer) ? saved.printer : (found[0] ?? ""));
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof PrinterError && cause.kind === "NOT_CONNECTED" ? QZ_NOT_CONNECTED : "Daftar printer gagal dimuat.");
      });
    return () => {
      current = false;
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Pengaturan printer struk</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {notice && <Alert severity="warning">{notice}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {!printers && !error && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Mencari printer…
            </Typography>
          )}
          {printers && (
            <SelectField id="printer-struk" label="Printer" value={printer} onChange={setPrinter}>
              {printers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField id="lebar-kertas" label="Lebar kertas" value={String(width)} onChange={(value) => setWidth(value === "58" ? 58 : 80)}>
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </SelectField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose}>
          Batal
        </Button>
        <Button type="button" variant="contained" disabled={!printer} onClick={() => onSaved({ printer, width })}>
          {saveLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getReceiptMessage, type ReceiptMessage } from "@/server/receipt";
import { DialogCloseButton } from "../mui/dialog-close-button";

/** "Kirim struk via WA" (spec struk WA 5): pesan dibuat server, resepsionis membuka WA atau menyalin. */
export function ReceiptSendDialog({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<ReceiptMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setOpen(true);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await getReceiptMessage(invoiceId);
        if (result.ok) setMessage(result.data);
        else setError(result.error);
      } catch {
        setError("Pesan struk gagal dibuat. Coba lagi.");
      }
    });
  }

  async function copy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.text);
      toast.success("Pesan disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <>
      <Button type="button" variant="outlined" color="success" onClick={load}>
        Kirim struk via WA
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Kirim struk</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          {pending && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Menyiapkan pesan…
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {message && (
            <>
              <Box component="p" sx={{ mt: 0, whiteSpace: "pre-line", fontSize: "0.875rem", p: 1.5, borderRadius: 1, bgcolor: "action.hover" }}>
                {message.text}
              </Box>
              {!message.link && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Nomor WhatsApp pasien tidak dikenali. Salin pesan lalu kirim manual.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="outlined" disabled={!message} onClick={() => void copy()}>
            Salin pesan
          </Button>
          {message?.link && (
            <Button component="a" href={message.link} target="_blank" rel="noopener noreferrer" variant="contained" color="success">
              Buka WhatsApp
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}

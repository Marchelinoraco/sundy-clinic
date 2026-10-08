"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import type { BookingMessage } from "@/lib/booking-messages";
import { MessageActions } from "./message-actions";
import { DialogCloseButton } from "./mui/dialog-close-button";

/** Dialog setelah Verifikasi (spec C2 3.1): kirim konfirmasi sekarang, atau nanti dari halaman Pengingat. */
export function SendMessageDialog({
  open,
  onOpenChange,
  title,
  description,
  appointmentId,
  message,
  sendLabel,
  laterNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  appointmentId: string;
  message: BookingMessage | null;
  sendLabel: string;
  laterNote?: string;
}) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onClose={close} maxWidth="xs">
      <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
      <DialogCloseButton onClick={close} />
      <DialogContent>
        {description && <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>}
        {message && (
          <MessageActions
            appointmentId={appointmentId}
            kind={message.kind}
            message={message}
            scheduledFor={message.scheduledFor}
            sendLabel={sendLabel}
            onSent={close}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ flexDirection: "column", alignItems: "stretch", gap: 0.5 }}>
        <Button type="button" variant="text" onClick={close}>
          {message ? "Nanti saja" : "Tutup"}
        </Button>
        {message && laterNote && (
          <Typography variant="caption" sx={{ textAlign: "center", color: "text.secondary" }}>
            {laterNote}
          </Typography>
        )}
      </DialogActions>
    </Dialog>
  );
}

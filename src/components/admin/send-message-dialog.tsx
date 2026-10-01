"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BookingMessage } from "@/lib/booking-messages";
import { MessageActions } from "./message-actions";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {message && (
          <MessageActions
            appointmentId={appointmentId}
            kind={message.kind}
            message={message}
            sendLabel={sendLabel}
            onSent={() => onOpenChange(false)}
          />
        )}
        <DialogFooter className="flex-col items-stretch gap-1 sm:flex-col">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {message ? "Nanti saja" : "Tutup"}
          </Button>
          {message && laterNote && <p className="text-center text-xs text-muted-foreground">{laterNote}</p>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

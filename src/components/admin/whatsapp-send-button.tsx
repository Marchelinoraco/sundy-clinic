"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { MessageKind } from "@/lib/booking-messages";
import { recordAppointmentMessage } from "@/server/appointment-message";

/**
 * Mencatat pesan WA sebagai terkirim (spec C2 bagian 6). WhatsApp sudah terbuka
 * di tab baru saat ini dipanggil, jadi kegagalan hanya bisa dilaporkan: admin
 * menekan lagi bila pesannya memang terkirim.
 */
export async function recordSentMessage(appointmentId: string, kind: MessageKind, scheduledFor: Date): Promise<boolean> {
  try {
    const result = await recordAppointmentMessage({ appointmentId, kind, scheduledFor });
    if (!result.ok) {
      toast.error(`Pengiriman belum tercatat: ${result.error}`);
      return false;
    }
    return true;
  } catch {
    toast.error("Pengiriman belum tercatat. Tekan lagi bila WhatsApp sudah terkirim.");
    return false;
  }
}

/** Tautan wa.me yang sekaligus mencatat pengiriman. "Salin teks" sengaja tidak memakai ini. */
export function WhatsAppSendButton({
  href,
  appointmentId,
  kind,
  scheduledFor,
  children,
  onRecorded,
  ...buttonProps
}: {
  href: string;
  appointmentId: string;
  kind: MessageKind;
  /** Jadwal yang tertulis di teks pesan (lihat recordAppointmentMessage). */
  scheduledFor: Date;
  children: ReactNode;
  onRecorded?: () => void;
} & Pick<ButtonProps, "size" | "variant" | "color" | "fullWidth">) {
  async function handleClick() {
    if (await recordSentMessage(appointmentId, kind, scheduledFor)) onRecorded?.();
  }

  return (
    <Button
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant="contained"
      {...buttonProps}
      onClick={() => void handleClick()}
    >
      {children}
    </Button>
  );
}

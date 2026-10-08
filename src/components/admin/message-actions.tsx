"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { toast } from "sonner";
import type { MessageKind, WhatsAppMessage } from "@/lib/booking-messages";
import { WhatsAppSendButton } from "./whatsapp-send-button";

/** Tombol kirim WA (mencatat) dan Salin teks (tidak mencatat), untuk dialog dan baris Pengingat. */
export function MessageActions({
  appointmentId,
  kind,
  message,
  scheduledFor,
  sendLabel,
  onSent,
  layout = "stack",
}: {
  appointmentId: string;
  kind: MessageKind;
  message: WhatsAppMessage;
  /** Jadwal yang tertulis di teks pesan. */
  scheduledFor: Date;
  sendLabel: string;
  onSent?: () => void;
  layout?: "stack" | "inline";
}) {
  const stack = layout === "stack";

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.text);
      toast.success("Teks disalin.");
    } catch {
      toast.error("Gagal menyalin. Pilih dan salin teks secara manual.");
    }
  }

  return (
    <Stack
      direction={stack ? "column" : "row"}
      spacing={stack ? 1 : 0.5}
      useFlexGap
      sx={stack ? undefined : { flexWrap: "wrap", alignItems: "center" }}
    >
      {message.link ? (
        <WhatsAppSendButton
          href={message.link}
          appointmentId={appointmentId}
          kind={kind}
          scheduledFor={scheduledFor}
          size={stack ? "medium" : "small"}
          color="success"
          fullWidth={stack}
          onRecorded={onSent}
        >
          {sendLabel}
        </WhatsAppSendButton>
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Nomor WhatsApp pasien tidak dikenali.
        </Typography>
      )}
      <Button type="button" variant="outlined" size={stack ? "medium" : "small"} fullWidth={stack} onClick={() => void copy()}>
        {stack ? "Salin teks" : "Salin"}
      </Button>
    </Stack>
  );
}

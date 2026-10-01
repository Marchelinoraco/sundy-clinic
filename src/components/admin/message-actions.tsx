"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MessageKind, WhatsAppMessage } from "@/lib/booking-messages";
import { cn } from "@/lib/utils";
import { WhatsAppSendButton } from "./whatsapp-send-button";

/** Tombol kirim WA (mencatat) dan Salin teks (tidak mencatat), untuk dialog dan baris Pengingat. */
export function MessageActions({
  appointmentId,
  kind,
  message,
  sendLabel,
  onSent,
  layout = "stack",
}: {
  appointmentId: string;
  kind: MessageKind;
  message: WhatsAppMessage;
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
    <div className={stack ? "space-y-2" : "flex flex-wrap items-center gap-1"}>
      {message.link ? (
        <WhatsAppSendButton
          href={message.link}
          appointmentId={appointmentId}
          kind={kind}
          size={stack ? "default" : "sm"}
          className={cn(stack && "w-full", "bg-emerald-700 text-white hover:bg-emerald-800")}
          onRecorded={onSent}
        >
          {sendLabel}
        </WhatsAppSendButton>
      ) : (
        <p className="text-sm text-muted-foreground">Nomor WhatsApp pasien tidak dikenali.</p>
      )}
      <Button
        type="button"
        variant="outline"
        size={stack ? "default" : "sm"}
        className={cn(stack && "w-full")}
        onClick={() => void copy()}
      >
        {stack ? "Salin teks" : "Salin"}
      </Button>
    </div>
  );
}

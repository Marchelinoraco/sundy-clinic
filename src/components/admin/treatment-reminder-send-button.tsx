"use client";

import Button from "@mui/material/Button";
import { toast } from "sonner";
import { recordTreatmentReminder } from "@/server/treatment-reminder";

/**
 * Tautan wa.me pengingat "waktunya treatment lagi" yang sekaligus mencatat kiriman (spec pengingat treatment PT12).
 * WhatsApp sudah terbuka saat pencatatan berjalan, jadi kegagalan hanya dilaporkan.
 */
export function TreatmentReminderSendButton({ href, patientId, treatmentOn, label = "Kirim" }: { href: string; patientId: string; treatmentOn: string; label?: string }) {
  async function record() {
    try {
      const result = await recordTreatmentReminder({ patientId, treatmentOn });
      if (!result.ok) toast.error(`Pengiriman belum tercatat: ${result.error}`);
    } catch {
      toast.error("Pengiriman belum tercatat. Tekan lagi bila WhatsApp sudah terkirim.");
    }
  }

  return (
    <Button component="a" href={href} target="_blank" rel="noopener noreferrer" variant="contained" color="success" size="small" onClick={() => void record()}>
      {label}
    </Button>
  );
}

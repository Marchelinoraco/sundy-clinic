"use client";

import Button from "@mui/material/Button";
import { toast } from "sonner";
import { recordPackageVisitReminder } from "@/server/package-reminder";

/**
 * Tautan wa.me pengingat kunjungan paket yang sekaligus mencatat kiriman per paket dan tanggal rencana (spec jadwal paket
 * JP12). WhatsApp sudah terbuka saat pencatatan berjalan, jadi kegagalan hanya dilaporkan.
 */
export function PackageReminderSendButton({ href, patientPackageId, visitOn }: { href: string; patientPackageId: string; visitOn: string }) {
  async function record() {
    try {
      const result = await recordPackageVisitReminder({ patientPackageId, visitOn });
      if (!result.ok) toast.error(`Pengiriman belum tercatat: ${result.error}`);
    } catch {
      toast.error("Pengiriman belum tercatat. Tekan lagi bila WhatsApp sudah terkirim.");
    }
  }

  return (
    <Button component="a" href={href} target="_blank" rel="noopener noreferrer" variant="contained" color="success" size="small" onClick={() => void record()}>
      Ingatkan via WA
    </Button>
  );
}

"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { openEncounter } from "@/server/encounter";

/** Tombol Periksa (spec 4.3): membuat atau membuka kunjungan, lalu pindah ke halamannya. */
export function OpenEncounterButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      try {
        const result = await openEncounter(appointmentId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        router.push(`/admin/kunjungan/${result.data.encounterId}`);
      } catch {
        toast.error("Gagal membuka kunjungan. Coba lagi.");
      }
    });
  }

  return (
    <Button size="small" variant="contained" onClick={open} disabled={pending}>
      Periksa
    </Button>
  );
}

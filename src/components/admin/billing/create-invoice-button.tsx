"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createInvoiceFromVisit } from "@/server/invoice-drafts";

/** Buat tagihan dari kunjungan final; bila sudah ada (dibuat orang lain), buka tagihan itu. */
export function CreateInvoiceButton({ appointmentId, patientName }: { appointmentId: string; patientName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createInvoiceFromVisit(appointmentId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/admin/tagihan/${result.data.id}`);
      } catch {
        setError("Gagal membuat tagihan. Coba lagi.");
      }
    });
  }

  return (
    <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
      <Button type="button" size="small" variant="contained" onClick={create} disabled={pending} aria-label={`Buat tagihan ${patientName}`}>
        {pending ? "Membuat…" : "Buat tagihan"}
      </Button>
      {error && (
        <Alert severity="error" sx={{ py: 0, fontSize: "0.75rem" }}>
          {error}
        </Alert>
      )}
    </Stack>
  );
}

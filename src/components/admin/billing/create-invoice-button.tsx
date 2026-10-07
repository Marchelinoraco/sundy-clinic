"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-1">
      <Button type="button" size="sm" onClick={create} disabled={pending} aria-label={`Buat tagihan ${patientName}`}>
        {pending ? "Membuat…" : "Buat tagihan"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

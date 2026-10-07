"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createDirectSale } from "@/server/invoice-drafts";
import { PatientPicker } from "../patient-picker";

/** Penjualan langsung tanpa kunjungan (spec tagihan 4.1): pilih pasien, lalu tagihan draf kosong terbuka. */
export function DirectSaleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(patient: { id: string }) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createDirectSale({ patientId: patient.id });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.push(`/admin/tagihan/${result.data.id}`);
      } catch {
        setError("Gagal membuat tagihan. Coba lagi.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          + Penjualan langsung
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Penjualan langsung</DialogTitle>
          <DialogDescription>Untuk obat atau produk yang dibeli tanpa kunjungan. Pilih pasien dulu.</DialogDescription>
        </DialogHeader>
        <PatientPicker onSelect={choose} />
        {pending && <p className="text-sm text-muted-foreground">Membuat tagihan…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

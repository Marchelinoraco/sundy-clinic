"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import {
  createPatientFromIntake,
  getMatchCandidates,
  matchPatient,
  type MatchCandidates,
} from "@/server/intake";

/**
 * Dialog pencocokan pasien untuk booking situs. Dibuka oleh daftar booking,
 * baik dari tombol "Cocokkan pasien" maupun dari menu ⋯ "Ganti pasien". Item
 * menu tertutup begitu dipilih, jadi dialog tidak boleh hidup di dalamnya.
 */
export function MatchPatientDialog({
  appointmentId,
  code,
  open,
  onOpenChange,
}: {
  appointmentId: string;
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cocokkan pasien — {code}</DialogTitle>
          <DialogDescription>
            Pilih pasien lama yang benar-benar orang yang sama, atau buat pasien baru dari isian. Satu nomor
            WhatsApp sering dipakai sekeluarga — periksa nama dan tanggal lahir.
          </DialogDescription>
        </DialogHeader>
        <MatchPatientBody appointmentId={appointmentId} code={code} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Dipasang hanya selama dialog terbuka, sehingga kandidat dimuat sekali setiap kali dialog dibuka. */
function MatchPatientBody({
  appointmentId,
  code,
  onDone,
}: {
  appointmentId: string;
  code: string;
  onDone: () => void;
}) {
  const [data, setData] = useState<MatchCandidates | null>(null);
  const [pending, startTransition] = useTransition();
  // onDone terbaru dipakai tanpa memuat ulang kandidat setiap kali induknya dirender ulang.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let current = true;
    getMatchCandidates(appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          toast.error(result.error);
          onDoneRef.current();
          return;
        }
        setData(result.data);
      })
      .catch(() => {
        if (!current) return;
        toast.error("Gagal memuat data pasien. Coba lagi.");
        onDoneRef.current();
      });
    return () => {
      current = false;
    };
  }, [appointmentId]);

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        onDoneRef.current();
      } catch {
        toast.error("Aksi gagal. Coba lagi.");
      }
    });
  }

  return (
    <>
      {!data ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{data.intake.name}</p>
            <p>
              {data.intake.whatsapp} · lahir {data.intake.birthDateLabel ?? "—"}
            </p>
            <p className="text-muted-foreground">
              {data.intake.claimsReturning ? "Mengaku pernah berobat di sini" : "Mengaku pasien baru"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Pasien yang mirip</p>
            {data.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada pasien dengan nomor WhatsApp, atau nama & tanggal lahir, yang sama.
              </p>
            ) : (
              data.candidates.map((candidate) => (
                <div key={candidate.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div>
                    <p className="font-medium">{candidate.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {candidate.medicalRecordNumber} · {candidate.whatsapp} · lahir {candidate.birthDateLabel ?? "—"} ·
                      kunjungan terakhir {candidate.lastVisitLabel ?? "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => matchPatient(appointmentId, candidate.id), `${code} dicocokkan dengan ${candidate.name}.`)
                    }
                  >
                    Pilih pasien ini
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          disabled={pending || !data}
          onClick={() => run(() => createPatientFromIntake(appointmentId), `Pasien baru dibuat untuk ${code}.`)}
        >
          Buat pasien baru
        </Button>
      </DialogFooter>
    </>
  );
}

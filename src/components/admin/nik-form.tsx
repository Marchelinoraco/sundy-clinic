"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NIK_FORMAT_ERROR, NIK_MISSING_REASONS, normalizeNik, type NikMissingReasonValue } from "@/lib/nik";
import { updatePatientNik } from "@/server/patient";
import { NikInput, type NikDraft } from "./nik-input";

/** NIK di halaman data pasien (spec check-in 3.4), untuk semua staf booking:manage. */
export function NikForm({
  patientId,
  nik,
  missingReason,
}: {
  patientId: string;
  nik: string | null;
  missingReason: NikMissingReasonValue | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NikDraft>({ mode: "NIK", value: nik ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    let payload: { nik: string | null; missingReason: string | null };
    if (draft.mode === "NIK") {
      const value = normalizeNik(draft.value);
      if (!value) {
        setError(NIK_FORMAT_ERROR);
        return;
      }
      payload = { nik: value, missingReason: null };
    } else {
      if (!draft.reason) {
        setError("Pilih alasan belum ada NIK.");
        return;
      }
      payload = { nik: null, missingReason: draft.reason };
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updatePatientNik({ patientId, ...payload });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("NIK disimpan.");
        setEditing(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan NIK. Coba lagi.");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <h3 className="text-xs text-muted-foreground">NIK</h3>
        {nik ? (
          <p>{nik}</p>
        ) : missingReason ? (
          <p className="font-medium text-amber-700">NIK belum ada ({NIK_MISSING_REASONS[missingReason]})</p>
        ) : (
          <p>—</p>
        )}
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0"
          onClick={() => {
            setDraft({ mode: "NIK", value: nik ?? "" });
            setEditing(true);
          }}
        >
          Ubah NIK
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <NikInput draft={draft} onChange={setDraft} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          Simpan
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
          Batal
        </Button>
      </div>
    </div>
  );
}

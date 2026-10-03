"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NIK_MISSING_REASONS, type NikMissingReasonValue } from "@/lib/nik";

export type NikDraft = { mode: "NIK"; value: string } | { mode: "MISSING"; reason: NikMissingReasonValue | "" };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** NIK 16 angka, atau "Belum ada NIK" dengan alasan (spec check-in 3.2). Dipakai dialog check-in dan data pasien. */
export function NikInput({
  draft,
  onChange,
  warning,
}: {
  draft: NikDraft;
  onChange: (draft: NikDraft) => void;
  /** Peringatan kecocokan dengan tanggal lahir/jenis kelamin; tidak menghalangi. */
  warning?: string | null;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">NIK</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name={`${id}-mode`} checked={draft.mode === "NIK"} onChange={() => onChange({ mode: "NIK", value: "" })} />
          Isi NIK
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={draft.mode === "MISSING"}
            onChange={() => onChange({ mode: "MISSING", reason: "" })}
          />
          Belum ada NIK
        </label>
      </div>
      {draft.mode === "NIK" ? (
        <div className="space-y-1">
          <Label htmlFor={`${id}-nik`}>NIK (16 angka)</Label>
          <Input
            id={`${id}-nik`}
            inputMode="numeric"
            autoComplete="off"
            value={draft.value}
            onChange={(e) => onChange({ mode: "NIK", value: e.target.value })}
          />
          {warning && <p className="text-xs text-amber-700">{warning}</p>}
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor={`${id}-reason`}>Alasan</Label>
          <select
            id={`${id}-reason`}
            className={selectClass}
            value={draft.reason}
            onChange={(e) => onChange({ mode: "MISSING", reason: e.target.value as NikMissingReasonValue | "" })}
          >
            <option value="">Pilih alasan</option>
            {Object.entries(NIK_MISSING_REASONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
    </fieldset>
  );
}

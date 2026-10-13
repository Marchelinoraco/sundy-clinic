"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setLinePerformer } from "@/server/invoice-drafts";
import type { InvoiceLineRow } from "@/server/invoice-read";
import { SelectField } from "../mui/select-field";

type LineView = Pick<InvoiceLineRow, "id" | "name" | "kind" | "performerId" | "performerName">;

/** Pilihan "Pelaksana" untuk baris treatment draf (spec harga modal 6). Tidak menampilkan angka komisi (M8). */
export function LinePerformerSelect({
  invoiceId,
  version,
  line,
  performers,
  disabled = false,
}: {
  invoiceId: string;
  version: number;
  line: LineView;
  performers: readonly { id: string; name: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (line.kind !== "TREATMENT") return null;
  const options = line.performerId && !performers.some((p) => p.id === line.performerId) ? [...performers, { id: line.performerId, name: line.performerName ?? "Pelaksana" }] : performers;

  function change(performerId: string) {
    startTransition(async () => {
      try {
        const result = await setLinePerformer({ invoiceId, version, lineId: line.id, performerId: performerId || null });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SelectField aria-label={`Pelaksana ${line.name}`} value={line.performerId ?? ""} onChange={change} disabled={disabled || pending} fullWidth={false} sx={{ mt: 0.5, minWidth: 180 }}>
      <option value="">Tanpa pelaksana</option>
      {options.map((performer) => (
        <option key={performer.id} value={performer.id}>
          {performer.name}
        </option>
      ))}
    </SelectField>
  );
}

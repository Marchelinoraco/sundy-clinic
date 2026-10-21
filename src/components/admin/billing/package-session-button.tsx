"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { optionKey, packageOptionsFor, packageTargetLabel, type PackageOption } from "@/lib/treatment-package";
import { applyPackageSession, releasePackageSession } from "@/server/invoice-drafts";
import type { InvoiceLineRow } from "@/server/invoice-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";

type LineView = Pick<InvoiceLineRow, "id" | "name" | "kind" | "serviceId" | "itemId" | "quantity" | "fromDispensing" | "packageUse">;

/** Sumber jatah untuk aksi server: paket customer, atau baris PAKET di draf ini (spec paket barang PB3). */
export const packageSource = (option: PackageOption) =>
  option.patientPackageItemId ? { patientPackageItemId: option.patientPackageItemId } : { purchaseLineId: option.purchaseLineId ?? "" };

/**
 * "Pakai sesi paket" untuk baris treatment, "Pakai jatah paket" untuk baris barang (termasuk obat resep), atau
 * "Lepas paket" (spec paket 6; paket barang PB4).
 */
export function PackageSessionButton({
  invoiceId,
  version,
  line,
  options,
  disabled = false,
}: {
  invoiceId: string;
  version: number;
  line: LineView;
  options: readonly PackageOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const goods = line.kind === "BARANG";
  const usable = (line.kind === "TREATMENT" && line.serviceId && !line.fromDispensing) || (goods && line.itemId);
  const candidates = usable ? packageOptionsFor(options, line, line.quantity) : [];
  const label = goods ? "Pakai jatah paket" : "Pakai sesi paket";

  function call(action: () => Promise<ActionResult<{ version: number }>>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success(success);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan. Coba lagi.");
      }
    });
  }
  const apply = (option: PackageOption | undefined) => {
    if (!option) return;
    call(() => applyPackageSession({ invoiceId, version, lineId: line.id, ...packageSource(option) }), goods ? "Jatah paket dipakai." : "Sesi paket dipakai.");
  };

  if (line.packageUse) {
    return (
      <Button
        type="button"
        size="small"
        variant="text"
        disabled={disabled || pending}
        aria-label={`Lepas paket ${line.name}`}
        onClick={() => call(() => releasePackageSession({ invoiceId, version, lineId: line.id }), "Paket dilepas.")}
      >
        Lepas paket
      </Button>
    );
  }
  if (candidates.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        size="small"
        variant="outlined"
        disabled={disabled || pending}
        aria-label={`${label} ${line.name}`}
        onClick={() => {
          if (candidates.length === 1) return apply(candidates[0]);
          setChoice(optionKey(candidates[0]));
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Pilih paket untuk {line.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <SelectField id={`package-choice-${line.id}`} label="Paket" value={choice} onChange={setChoice}>
              {candidates.map((option) => (
                <option key={optionKey(option)} value={optionKey(option)}>
                  {packageTargetLabel(option)}
                </option>
              ))}
            </SelectField>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending || !choice} onClick={() => apply(candidates.find((option) => optionKey(option) === choice))}>
            Pakai
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

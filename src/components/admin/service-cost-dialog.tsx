"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { costWarning, serviceCostSummary, validateServiceCost, type CommissionKindValue, type ServiceCostInput } from "@/lib/costing";
import { updateServiceCost } from "@/server/service-admin";
import { DialogCloseButton } from "./mui/dialog-close-button";
import { SelectField } from "./mui/select-field";
import { RupiahInput } from "./rupiah-input";

type CostedService = { id: string; name: string; promoPrice: number } & ServiceCostInput;
type Draft = { materialCost: number | null; toolCost: number | null; commissionKind: CommissionKindValue | ""; commissionValue: number | null };

const draftOf = (service: CostedService): Draft => ({
  materialCost: service.materialCost,
  toolCost: service.toolCost,
  commissionKind: service.commissionKind ?? "",
  commissionValue: service.commissionKind ? service.commissionValue : null,
});

function inputOf(draft: Draft): ServiceCostInput {
  return {
    materialCost: draft.materialCost ?? 0,
    toolCost: draft.toolCost ?? 0,
    commissionKind: draft.commissionKind || null,
    commissionValue: draft.commissionKind ? (draft.commissionValue ?? 0) : 0,
  };
}

/** Biaya bahan, alat, dan komisi pelaksana per sesi treatment; diisi Admin Keuangan (spec harga modal 5). */
export function ServiceCostDialog({ service }: { service: CostedService }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(service));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const warning = costWarning(inputOf(draft), service.promoPrice);

  function openDialog() {
    setDraft(draftOf(service));
    setError(null);
    setOpen(true);
  }

  function save() {
    const input = inputOf(draft);
    const checked = validateServiceCost(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateServiceCost({ id: service.id, ...checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Biaya tersimpan.");
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {serviceCostSummary(service)}
        </Typography>
        <Button type="button" size="small" variant="text" onClick={openDialog} aria-label={`Biaya ${service.name}`}>
          Biaya
        </Button>
      </Stack>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Biaya {service.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Per sesi. Bahan dan alat masuk harga pokok laporan; komisi untuk pelaksana treatment.
            </Typography>
            <RupiahInput id={`cost-material-${service.id}`} label="Biaya bahan" value={draft.materialCost} onChange={(materialCost) => setDraft((d) => ({ ...d, materialCost }))} fullWidth />
            <RupiahInput id={`cost-tool-${service.id}`} label="Biaya alat" value={draft.toolCost} onChange={(toolCost) => setDraft((d) => ({ ...d, toolCost }))} fullWidth />
            <SelectField
              id={`cost-commission-${service.id}`}
              label="Komisi"
              value={draft.commissionKind}
              onChange={(kind) => setDraft((d) => ({ ...d, commissionKind: kind as CommissionKindValue | "", commissionValue: null }))}
            >
              <option value="">Tanpa komisi</option>
              <option value="NOMINAL">Rupiah per sesi</option>
              <option value="PERSEN">Persen dari harga</option>
            </SelectField>
            {draft.commissionKind === "NOMINAL" && (
              <RupiahInput
                id={`cost-commission-value-${service.id}`}
                label="Komisi per sesi"
                value={draft.commissionValue}
                onChange={(commissionValue) => setDraft((d) => ({ ...d, commissionValue }))}
                fullWidth
              />
            )}
            {draft.commissionKind === "PERSEN" && (
              <TextField
                id={`cost-commission-percent-${service.id}`}
                label="Komisi persen"
                type="number"
                value={draft.commissionValue ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, commissionValue: e.target.value === "" ? null : Number(e.target.value) }))}
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: 100, inputMode: "numeric" } }}
              />
            )}
            {warning && <Alert severity="warning">{warning}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

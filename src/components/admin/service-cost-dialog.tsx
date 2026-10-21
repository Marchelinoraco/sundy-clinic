"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
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
import {
  costOverPrice,
  serviceCostSummary,
  totalCostPerSession,
  validateOtherCosts,
  validateServiceCost,
  type CommissionKindValue,
  type OtherCost,
  type ServiceCostInput,
} from "@/lib/costing";
import { formatRupiah } from "@/lib/format";
import { validatePriceChange } from "@/lib/price-validation";
import { updateServicePricing } from "@/server/service-admin";
import { DialogCloseButton } from "./mui/dialog-close-button";
import { SelectField } from "./mui/select-field";
import { RupiahInput } from "./rupiah-input";

type PricedService = { id: string; name: string; normalPrice: number | null; promoPrice: number; otherCosts: OtherCost[] } & ServiceCostInput;
type OtherDraft = { name: string; amount: number | null };
type Draft = {
  normalPrice: number | null;
  promoPrice: number | null;
  materialCost: number | null;
  toolCost: number | null;
  commissionKind: CommissionKindValue | "";
  commissionValue: number | null;
  otherCosts: OtherDraft[];
};

const draftOf = (service: PricedService): Draft => ({
  normalPrice: service.normalPrice,
  promoPrice: service.promoPrice,
  materialCost: service.materialCost,
  toolCost: service.toolCost,
  commissionKind: service.commissionKind ?? "",
  commissionValue: service.commissionKind ? service.commissionValue : null,
  otherCosts: service.otherCosts.map((other) => ({ ...other })),
});

function costOf(draft: Draft): ServiceCostInput {
  return {
    materialCost: draft.materialCost ?? 0,
    toolCost: draft.toolCost ?? 0,
    commissionKind: draft.commissionKind || null,
    commissionValue: draft.commissionKind ? (draft.commissionValue ?? 0) : 0,
  };
}

/** Baris yang sudah lengkap saja yang dihitung di ringkasan; baris setengah terisi ditolak saat Simpan. */
const filledOthers = (others: readonly OtherDraft[]): OtherCost[] =>
  others.flatMap((other) => (other.name.trim() && other.amount !== null ? [{ name: other.name.trim(), amount: other.amount }] : []));

/**
 * Harga dan biaya per sesi treatment dalam satu dialog, diisi Admin Keuangan (spec biaya lainnya BL6): total biaya
 * per sesi tidak boleh melebihi harga berlaku (BL4), komisi persen dihitung dari harga yang sedang diketik (BL7).
 */
export function ServiceCostDialog({ service }: { service: PricedService }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(service));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const price = draft.promoPrice ?? 0;
  const total = totalCostPerSession(costOf(draft), filledOthers(draft.otherCosts), price);
  const over = costOverPrice(costOf(draft), filledOthers(draft.otherCosts), price);
  const savedTotal = totalCostPerSession(service, service.otherCosts, service.promoPrice);
  const setOther = (index: number, patch: Partial<OtherDraft>) =>
    setDraft((d) => ({ ...d, otherCosts: d.otherCosts.map((other, i) => (i === index ? { ...other, ...patch } : other)) }));

  function openDialog() {
    setDraft(draftOf(service));
    setError(null);
    setOpen(true);
  }

  function save() {
    const priceError = draft.promoPrice === null ? "Isi harga berlaku." : validatePriceChange({ normalPrice: draft.normalPrice, promoPrice: draft.promoPrice });
    const cost = validateServiceCost(costOf(draft));
    const others = validateOtherCosts(draft.otherCosts);
    const message = priceError ?? (!cost.ok ? cost.message : !others.ok ? others.message : null);
    if (message || !cost.ok || !others.ok || draft.promoPrice === null) {
      setError(message);
      return;
    }
    setError(null);
    const promoPrice = draft.promoPrice;
    startTransition(async () => {
      try {
        const result = await updateServicePricing({ id: service.id, normalPrice: draft.normalPrice, promoPrice, ...cost.value, otherCosts: others.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Harga dan biaya tersimpan.");
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
        <Box>
          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
            {serviceCostSummary(service, service.otherCosts)}
          </Typography>
          {savedTotal > 0 && (
            <Typography variant="caption" component="div" sx={{ fontWeight: 500 }}>
              total {formatRupiah(savedTotal)}
            </Typography>
          )}
          {savedTotal > service.promoPrice && (
            <Typography variant="caption" component="div" sx={{ color: "error.main", fontWeight: 500 }}>
              Biaya melebihi harga
            </Typography>
          )}
        </Box>
        <Button type="button" size="small" variant="text" onClick={openDialog} aria-label={`Harga & biaya ${service.name}`}>
          Harga &amp; biaya
        </Button>
      </Stack>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Harga &amp; biaya {service.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography component="h3" variant="subtitle2">
              Harga
            </Typography>
            <Stack direction="row" spacing={1}>
              <RupiahInput id={`pricing-normal-${service.id}`} label="Harga coret (opsional)" value={draft.normalPrice} onChange={(normalPrice) => setDraft((d) => ({ ...d, normalPrice }))} fullWidth />
              <RupiahInput id={`pricing-promo-${service.id}`} label="Harga berlaku" value={draft.promoPrice} onChange={(promoPrice) => setDraft((d) => ({ ...d, promoPrice }))} fullWidth />
            </Stack>
            <Typography component="h3" variant="subtitle2">
              Biaya per sesi
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Per sesi. Bahan, alat, dan biaya lainnya masuk harga pokok laporan; komisi untuk pelaksana treatment.
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
            <Typography component="h3" variant="subtitle2">
              Biaya lainnya
            </Typography>
            {draft.otherCosts.map((other, index) => (
              <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <TextField
                  label={`Nama biaya ${index + 1}`}
                  value={other.name}
                  onChange={(e) => setOther(index, { name: e.target.value })}
                  fullWidth
                  slotProps={{ htmlInput: { "aria-label": `Nama biaya lainnya ${index + 1}`, maxLength: 60 } }}
                />
                <RupiahInput label="Per sesi" aria-label={`Nominal biaya lainnya ${index + 1}`} value={other.amount} onChange={(amount) => setOther(index, { amount })} sx={{ width: 150, flexShrink: 0 }} />
                <Button
                  type="button"
                  size="small"
                  variant="text"
                  aria-label={`Hapus biaya lainnya ${index + 1}`}
                  onClick={() => setDraft((d) => ({ ...d, otherCosts: d.otherCosts.filter((_, i) => i !== index) }))}
                >
                  Hapus
                </Button>
              </Stack>
            ))}
            <Box>
              <Button type="button" size="small" variant="outlined" onClick={() => setDraft((d) => ({ ...d, otherCosts: [...d.otherCosts, { name: "", amount: null }] }))}>
                + Biaya lainnya
              </Button>
            </Box>
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "action.hover" }}>
              <Typography variant="body2">
                Total biaya per sesi {formatRupiah(total)} · harga berlaku {formatRupiah(price)}
              </Typography>
              <Typography variant="body2" sx={{ color: over ? "error.main" : "success.main", fontWeight: 500 }}>
                {over ? `Kurang ${formatRupiah(total - price)} per sesi` : `Sisa ${formatRupiah(price - total)} per sesi`}
              </Typography>
            </Box>
            {over && <Alert severity="error">{over}</Alert>}
            {error && !over && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending || over !== null} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

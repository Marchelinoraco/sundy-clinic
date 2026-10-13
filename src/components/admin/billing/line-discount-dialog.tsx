"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { validateLineDiscount, type DiscountKindValue } from "@/lib/invoice";
import { clearLineDiscount, setLineDiscount } from "@/server/invoice-drafts";
import type { InvoiceLineRow } from "@/server/invoice-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

type LineView = Pick<InvoiceLineRow, "id" | "name" | "gross" | "discountAmount" | "discountReason" | "discountSource">;

/** "Diskon −Rp30.000 · Promo: Oktober" di bawah nama baris (spec perbaikan tagihan 5.3). */
export function LineDiscountNote({ line }: { line: LineView }) {
  if (line.discountAmount <= 0) return null;
  return (
    <Typography variant="caption" component="div" sx={{ color: "success.main", display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
      {line.discountSource === "PROMO" && <Chip label="Promo" size="small" color="success" variant="outlined" />}
      Diskon −{formatRupiah(line.discountAmount)} · {line.discountReason}
    </Typography>
  );
}

/** Diskon manual satu baris draf (spec perbaikan tagihan 5.2). */
export function LineDiscountDialog({ invoiceId, version, line, disabled = false }: { invoiceId: string; version: number; line: LineView; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DiscountKindValue>("NOMINAL");
  const [nominal, setNominal] = useState<number | null>(null);
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const value = kind === "NOMINAL" ? (nominal ?? Number.NaN) : Number(percent || Number.NaN);
  const preview = kind === "PERSEN" && Number.isInteger(value) && value > 0 ? Math.floor((line.gross * value) / 100) : null;

  function reset() {
    setKind("NOMINAL");
    setNominal(null);
    setPercent("");
    setReason("");
    setError(null);
  }

  function run(action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, success: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(success);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  function apply() {
    const input = { kind, value, reason };
    const checked = validateLineDiscount(input, { gross: line.gross });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    run(() => setLineDiscount({ invoiceId, version, lineId: line.id, ...input }), "Diskon baris disimpan.");
  }

  return (
    <>
      <Button
        type="button"
        size="small"
        variant="text"
        disabled={disabled}
        aria-label={`Diskon ${line.name}`}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Diskon
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Diskon {line.name}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Harga baris {formatRupiah(line.gross)}.
            {line.discountAmount > 0 &&
              (line.discountSource === "PROMO"
                ? ` Sekarang: promo ${formatRupiah(line.discountAmount)} (${line.discountReason}). Mengubahnya menjadikan diskon manual.`
                : ` Sekarang: ${formatRupiah(line.discountAmount)} (${line.discountReason}).`)}
          </DialogContentText>
          <Stack spacing={2}>
            <SelectField id={`line-discount-kind-${line.id}`} label="Jenis diskon" value={kind} onChange={(next) => setKind(next as DiscountKindValue)}>
              <option value="NOMINAL">Nominal untuk seluruh baris</option>
              <option value="PERSEN">Persen</option>
            </SelectField>
            {kind === "NOMINAL" ? (
              <RupiahInput id={`line-discount-nominal-${line.id}`} label="Nominal" value={nominal} onChange={setNominal} fullWidth />
            ) : (
              <TextField id={`line-discount-percent-${line.id}`} label="Persen" type="number" value={percent} onChange={(e) => setPercent(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 100 } }} fullWidth />
            )}
            {preview !== null && (
              <Typography variant="body2">
                Potongan {formatRupiah(preview)} dari {formatRupiah(line.gross)}
              </Typography>
            )}
            <TextField id={`line-discount-reason-${line.id}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {line.discountAmount > 0 && (
            <Box sx={{ mr: "auto" }}>
              <Button type="button" color="error" disabled={pending} onClick={() => run(() => clearLineDiscount({ invoiceId, version, lineId: line.id }), "Diskon baris dihapus.")}>
                Hapus diskon
              </Button>
            </Box>
          )}
          <Button type="button" variant="contained" disabled={pending} onClick={apply}>
            Terapkan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

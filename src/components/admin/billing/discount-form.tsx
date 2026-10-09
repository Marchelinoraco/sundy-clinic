"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { DISCOUNT_KIND_LABEL, DISCOUNT_LIMIT_PERCENT, validateDiscount, type DiscountKindValue } from "@/lib/invoice";
import { setInvoiceDiscount } from "@/server/invoice-drafts";
import type { InvoiceDetail } from "@/server/invoice-read";
import { SelectField } from "../mui/select-field";
import type { useInvoiceAction } from "./invoice-draft-editor";

/** Diskon per tagihan (spec tagihan TG9): nominal atau persen, wajib alasan; resepsionis paling banyak 20%. */
export function DiscountForm({
  detail,
  canExceed,
  run,
  fail,
  disabled,
}: {
  detail: InvoiceDetail;
  canExceed: boolean;
  run: ReturnType<typeof useInvoiceAction>["run"];
  fail: (message: string) => void;
  disabled: boolean;
}) {
  const [kind, setKind] = useState<DiscountKindValue | "">(detail.discountKind ?? "");
  const [value, setValue] = useState(detail.discountKind ? String(detail.discountValue) : "");
  const [reason, setReason] = useState(detail.discountReason ?? "");

  function apply() {
    const input = { kind: kind || null, value: value === "" ? 0 : Number(value), reason };
    const checked = validateDiscount(input, { subtotal: detail.totals.subtotal, canExceed });
    if (!checked.ok) return fail(checked.message);
    run(() => setInvoiceDiscount({ invoiceId: detail.id, version: detail.version, ...input }));
  }

  function clear() {
    setKind("");
    setValue("");
    setReason("");
    run(() => setInvoiceDiscount({ invoiceId: detail.id, version: detail.version, kind: null, value: 0, reason: "" }));
  }

  return (
    <Paper component="fieldset" variant="outlined" sx={{ m: 0, p: 1.5, minWidth: 0 }}>
      <Box component="legend" sx={{ px: 0.5, fontSize: "0.875rem", fontWeight: 500 }}>
        Diskon
      </Box>
      <Stack spacing={1.5}>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "11rem 9rem 1fr" } }}>
          <SelectField id="discount-kind" label="Jenis diskon" value={kind} onChange={(next) => setKind(next as DiscountKindValue | "")}>
            <option value="">Tanpa diskon</option>
            {(Object.keys(DISCOUNT_KIND_LABEL) as DiscountKindValue[]).map((option) => (
              <option key={option} value={option}>
                {DISCOUNT_KIND_LABEL[option]}
              </option>
            ))}
          </SelectField>
          <TextField
            id="discount-value"
            label="Nilai diskon"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            fullWidth
            slotProps={{ htmlInput: { min: 0 } }}
          />
          <TextField id="discount-reason" label="Alasan diskon" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
        </Box>
        {!canExceed && (
          <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
            Diskon di atas {DISCOUNT_LIMIT_PERCENT}% dari subtotal hanya bisa diberikan Admin Keuangan.
          </Typography>
        )}
        <Stack direction="row" spacing={1}>
          <Button type="button" size="small" variant="contained" onClick={apply} disabled={disabled}>
            Terapkan diskon
          </Button>
          {detail.discountKind && (
            <Button type="button" size="small" variant="text" onClick={clear} disabled={disabled}>
              Hapus diskon
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

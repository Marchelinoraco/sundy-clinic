"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISCOUNT_KIND_LABEL, DISCOUNT_LIMIT_PERCENT, validateDiscount, type DiscountKindValue } from "@/lib/invoice";
import { setInvoiceDiscount } from "@/server/invoice-drafts";
import type { InvoiceDetail } from "@/server/invoice-read";
import type { useInvoiceAction } from "./invoice-draft-editor";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

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
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Diskon</legend>
      <div className="grid gap-3 sm:grid-cols-[10rem_8rem_1fr]">
        <div className="space-y-1">
          <Label htmlFor="discount-kind">Jenis diskon</Label>
          <select id="discount-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as DiscountKindValue | "")}>
            <option value="">Tanpa diskon</option>
            {(Object.keys(DISCOUNT_KIND_LABEL) as DiscountKindValue[]).map((option) => (
              <option key={option} value={option}>
                {DISCOUNT_KIND_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="discount-value">Nilai diskon</Label>
          <Input id="discount-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="discount-reason">Alasan diskon</Label>
          <Input id="discount-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      {!canExceed && <p className="text-xs text-muted-foreground">Diskon di atas {DISCOUNT_LIMIT_PERCENT}% dari subtotal hanya bisa diberikan Admin Keuangan.</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={apply} disabled={disabled}>
          Terapkan diskon
        </Button>
        {detail.discountKind && (
          <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={disabled}>
            Hapus diskon
          </Button>
        )}
      </div>
    </fieldset>
  );
}

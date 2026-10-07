"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADJUST_REASON_LABEL, DECREASE_REASONS, INCREASE_REASONS, validateAdjustment, type AdjustReasonValue } from "@/lib/stock";
import { adjustStock } from "@/server/stock-movements";

type Direction = "KURANGI" | "TAMBAH";
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Penyesuaian satu batch (spec stok 5.4). Batas sisa diperiksa lagi di server secara atomik. */
export function AdjustStockDialog({ batch }: { batch: { id: string; label: string; remaining: number; unit: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("KURANGI");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<AdjustReasonValue>(DECREASE_REASONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasons = direction === "KURANGI" ? DECREASE_REASONS : INCREASE_REASONS;

  function changeDirection(next: Direction) {
    setDirection(next);
    setReason(next === "KURANGI" ? DECREASE_REASONS[0] : INCREASE_REASONS[0]);
    setError(null);
  }

  function save() {
    const input = { batchId: batch.id, direction, quantity: Number(quantity), reason, note };
    const checked = validateAdjustment(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    if (checked.value.delta < 0 && -checked.value.delta > batch.remaining) {
      setError(`Pengurangan melebihi sisa batch (${batch.remaining} ${batch.unit}).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await adjustStock(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Stok disesuaikan.");
        setOpen(false);
        setQuantity("");
        setNote("");
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Penyesuaian ${batch.label}`}>
          Penyesuaian
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Penyesuaian stok</DialogTitle>
          <DialogDescription>
            {batch.label} · sisa {batch.remaining} {batch.unit}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2" role="group" aria-label="Arah penyesuaian">
            {(["KURANGI", "TAMBAH"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={direction === value ? "default" : "outline"}
                aria-pressed={direction === value}
                onClick={() => changeDirection(value)}
              >
                {value === "KURANGI" ? "Kurangi" : "Tambah"}
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjust-quantity">Jumlah</Label>
            <Input id="adjust-quantity" type="number" min={1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjust-reason">Alasan</Label>
            <select
              id="adjust-reason"
              className={selectClass}
              value={reason}
              onChange={(e) => setReason(e.target.value as AdjustReasonValue)}
            >
              {reasons.map((value) => (
                <option key={value} value={value}>
                  {ADJUST_REASON_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjust-note">Catatan</Label>
            <Input id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { formatRupiah } from "@/lib/format";
import { validateReturn } from "@/lib/stock";
import { createSupplierReturn } from "@/server/stock-movements";

type ReturnLine = { batchId: string; label: string; remaining: number; unitCost: number; unit: string };

/** Retur ke supplier dari halaman faktur (spec stok 5.5). Nilai retur mengurangi hutang faktur ini. */
export function SupplierReturnDialog({ invoiceId, lines }: { invoiceId: string; lines: ReturnLine[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const picked = lines
    .map((line) => ({ line, quantity: Number(quantities[line.batchId] ?? "") }))
    .filter(({ quantity }) => quantity !== 0 && !Number.isNaN(quantity));
  const total = picked.reduce((sum, { line, quantity }) => (Number.isInteger(quantity) && quantity > 0 ? sum + quantity * line.unitCost : sum), 0);

  function save() {
    const over = picked.find(({ line, quantity }) => quantity > line.remaining);
    if (over) {
      setError(`Jumlah retur ${over.line.label} melebihi sisa (${over.line.remaining} ${over.line.unit}).`);
      return;
    }
    const input = { invoiceId, lines: picked.map(({ line, quantity }) => ({ batchId: line.batchId, quantity })), note };
    const checked = validateReturn(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createSupplierReturn(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Retur ${formatRupiah(total)} dicatat.`);
        setOpen(false);
        setQuantities({});
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
        <Button type="button" variant="outline">
          Retur ke supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Retur ke supplier</DialogTitle>
          <DialogDescription>Isi jumlah yang dikembalikan. Stok berkurang dan hutang faktur ini berkurang sebesar nilainya.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.batchId} className="grid items-center gap-2 sm:grid-cols-[1fr_8rem]">
              <Label htmlFor={`return-${line.batchId}`} className="font-normal">
                {line.label}
                <span className="block text-xs text-muted-foreground">
                  sisa {line.remaining} {line.unit} · {formatRupiah(line.unitCost)} per {line.unit}
                </span>
              </Label>
              <Input
                id={`return-${line.batchId}`}
                aria-label={`Jumlah retur ${line.label}`}
                type="number"
                min={0}
                max={line.remaining}
                inputMode="numeric"
                value={quantities[line.batchId] ?? ""}
                onChange={(e) => setQuantities((current) => ({ ...current, [line.batchId]: e.target.value }))}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="return-note">Catatan retur</Label>
            <Input id="return-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="text-sm">
            Nilai retur: <strong>{formatRupiah(total)}</strong>
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan retur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateFreeLine } from "@/lib/invoice";
import { addFreeLine } from "@/server/invoice-drafts";
import { RupiahInput } from "../rupiah-input";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Tambah baris layanan atau treatment yang tidak ada di kunjungan (spec tagihan 4.2). */
export function AddFreeLineDialog({ invoiceId, version }: { invoiceId: string; version: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"LAYANAN" | "TREATMENT">("LAYANAN");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const input = { kind, name, quantity: Number(quantity), unitPrice: unitPrice ?? Number.NaN };
    const checked = validateFreeLine(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await addFreeLine({ invoiceId, version, ...checked.value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        setName("");
        setQuantity("1");
        setUnitPrice(null);
        router.refresh();
      } catch {
        setError("Gagal menambah baris. Coba lagi.");
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
          + Baris layanan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah baris layanan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="free-kind">Jenis</Label>
            <select id="free-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as "LAYANAN" | "TREATMENT")}>
              <option value="LAYANAN">Layanan</option>
              <option value="TREATMENT">Treatment</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="free-name">Nama</Label>
            <Input id="free-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="free-quantity">Jumlah</Label>
            <Input id="free-quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="free-price">Harga</Label>
            <RupiahInput id="free-price" value={unitPrice} onChange={setUnitPrice} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" onClick={add} disabled={pending}>
            Tambah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

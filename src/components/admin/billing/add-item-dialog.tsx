"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateItemAdd } from "@/lib/invoice";
import { addInvoiceItem } from "@/server/invoice-drafts";
import type { BillingItem } from "@/server/invoice-read";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Tambah obat atau produk dari katalog stok dengan harga jual saat ini (spec tagihan 4.2). */
export function AddItemDialog({ invoiceId, version, items, onError }: { invoiceId: string; version: number; items: BillingItem[]; onError: (message: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const input = { itemId, quantity: Number(quantity) };
    const checked = validateItemAdd(input);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await addInvoiceItem({ invoiceId, version, ...input });
        if (!result.ok) {
          onError(result.error);
        }
        setOpen(false);
        setItemId("");
        setQuantity("1");
        router.refresh();
      } catch {
        setError("Gagal menambah barang. Coba lagi.");
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
          + Tambah barang
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah barang</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="add-item">Barang</Label>
            <select id="add-item" className={selectClass} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Pilih barang…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id} disabled={item.available <= 0}>
                  {item.name} ({item.code}) — sisa {item.available} {item.unit}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-item-quantity">Jumlah</Label>
            <Input id="add-item-quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
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

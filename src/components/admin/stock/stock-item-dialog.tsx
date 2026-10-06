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
import { STOCK_ITEM_KIND_LABEL, validateStockItem, type StockItemInput, type StockItemKindValue } from "@/lib/stock";
import { createStockItem, updateStockItem } from "@/server/stock-catalog";
import { RupiahInput } from "../rupiah-input";

const EMPTY: StockItemInput = { code: "", name: "", kind: "OBAT", unit: "", sellPrice: null, minStock: 0, notes: "" };
const KINDS = Object.keys(STOCK_ITEM_KIND_LABEL) as StockItemKindValue[];
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Tambah atau ubah barang (spec stok 5.1). Aturan isian diulang di server. */
export function StockItemDialog({
  itemId,
  initial,
  triggerLabel,
}: {
  itemId?: string;
  initial?: StockItemInput;
  triggerLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<StockItemInput>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof StockItemInput>(key: K, next: StockItemInput[K]) => setValue((v) => ({ ...v, [key]: next }));

  function save() {
    const checked = validateStockItem(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = itemId ? await updateStockItem(itemId, value) : await createStockItem(value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(itemId ? "Barang diperbarui." : `${checked.value.name} ditambahkan.`);
        setOpen(false);
        if (!itemId) setValue(EMPTY);
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
        <Button variant={itemId ? "outline" : "default"}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{itemId ? "Ubah barang" : "Tambah barang"}</DialogTitle>
          <DialogDescription>Obat dan produk yang dibeli dari supplier dan distok di klinik.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="stock-item-code">Kode</Label>
            <Input id="stock-item-code" value={value.code} onChange={(e) => set("code", e.target.value)} placeholder="OBT-001" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stock-item-kind">Jenis</Label>
            <select
              id="stock-item-kind"
              className={selectClass}
              value={value.kind}
              onChange={(e) => set("kind", e.target.value as StockItemKindValue)}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {STOCK_ITEM_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="stock-item-name">Nama</Label>
            <Input id="stock-item-name" value={value.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stock-item-unit">Satuan</Label>
            <Input id="stock-item-unit" value={value.unit} onChange={(e) => set("unit", e.target.value)} placeholder="tablet, botol, tube" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stock-item-min">Batas menipis</Label>
            <Input
              id="stock-item-min"
              type="number"
              min={0}
              inputMode="numeric"
              value={value.minStock}
              onChange={(e) => set("minStock", e.target.value === "" ? 0 : Number(e.target.value))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="stock-item-price">Harga jual</Label>
            <RupiahInput
              id="stock-item-price"
              value={value.sellPrice}
              onChange={(next) => set("sellPrice", next)}
              placeholder="Boleh dikosongkan"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="stock-item-notes">Catatan</Label>
            <Input id="stock-item-notes" value={value.notes} onChange={(e) => set("notes", e.target.value)} />
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

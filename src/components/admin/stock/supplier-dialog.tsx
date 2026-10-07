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
import { validateSupplier, type SupplierInput } from "@/lib/stock";
import { createSupplier, updateSupplier } from "@/server/stock-catalog";

const EMPTY: SupplierInput = { name: "", phone: "", address: "", notes: "" };

/** Tambah atau ubah supplier (spec stok 5.6). `onSaved` dipanggil setelah supplier baru dibuat. */
export function SupplierDialog({
  supplierId,
  initial,
  triggerLabel,
  onSaved,
}: {
  supplierId?: string;
  initial?: SupplierInput;
  triggerLabel: string;
  onSaved?: (supplier: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<SupplierInput>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof SupplierInput, next: string) => setValue((v) => ({ ...v, [key]: next }));

  function save() {
    const checked = validateSupplier(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (supplierId) {
          const result = await updateSupplier(supplierId, value);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success("Supplier diperbarui.");
        } else {
          const result = await createSupplier(value);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(`${result.data.name} ditambahkan.`);
          onSaved?.(result.data);
          setValue(EMPTY);
        }
        setOpen(false);
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
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplierId ? "Ubah supplier" : "Tambah supplier"}</DialogTitle>
          <DialogDescription>Pemasok obat dan produk klinik.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="supplier-name">Nama supplier</Label>
            <Input id="supplier-name" value={value.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-phone">Telepon</Label>
            <Input id="supplier-phone" value={value.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-address">Alamat</Label>
            <Input id="supplier-address" value={value.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-notes">Catatan</Label>
            <Input id="supplier-notes" value={value.notes} onChange={(e) => set("notes", e.target.value)} />
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

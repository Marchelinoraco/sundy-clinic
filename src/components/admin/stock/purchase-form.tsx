"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { DEFAULT_DUE_DAYS, isDateString, validatePurchase, type PurchaseInput } from "@/lib/stock";
import { addDaysToDateString } from "@/lib/time";
import { createPurchase } from "@/server/purchases";
import type { StockItemOption, SupplierOption } from "@/server/stock-read";
import { RupiahInput } from "../rupiah-input";
import { SupplierDialog } from "./supplier-dialog";

type LineDraft = { key: number; itemId: string; quantity: string; unitCost: number | null; batchNumber: string; expiryDate: string };

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const emptyLine = (key: number): LineDraft => ({ key, itemId: "", quantity: "", unitCost: null, batchNumber: "", expiryDate: "" });

/**
 * Barang masuk dari faktur kertas supplier (spec stok 5.2): kepala faktur, lalu baris barang
 * dengan jumlah, harga beli, batch, dan kedaluwarsa. Aturannya diulang di server.
 */
export function PurchaseForm({
  items,
  suppliers: initialSuppliers,
  branches,
  today,
}: {
  items: StockItemOption[];
  suppliers: SupplierOption[];
  branches: { id: string; name: string }[];
  /** Hari ini dalam WITA, dari server. */
  today: string;
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDaysToDateString(today, DEFAULT_DUE_DAYS));
  const [dueTouched, setDueTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const total = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    return Number.isInteger(quantity) && quantity > 0 && line.unitCost !== null ? sum + quantity * line.unitCost : sum;
  }, 0);

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  function addLine() {
    setLines((current) => [...current, emptyLine(nextKey)]);
    setNextKey((key) => key + 1);
  }

  function changeInvoiceDate(value: string) {
    setInvoiceDate(value);
    if (!dueTouched && isDateString(value)) setDueDate(addDaysToDateString(value, DEFAULT_DUE_DAYS));
  }

  function submit() {
    const input: PurchaseInput = {
      supplierId,
      branchId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      notes,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        unitCost: line.unitCost ?? Number.NaN,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
      })),
    };
    const checked = validatePurchase(input, { today, kindOf: (id) => byId.get(id)?.kind ?? null });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createPurchase(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/admin/stok/masuk/${result.data.id}`);
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2" aria-label="Faktur supplier">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="purchase-supplier">Supplier</Label>
          <div className="flex flex-wrap gap-2">
            <select
              id="purchase-supplier"
              className={`${selectClass} sm:w-96`}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Pilih supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <SupplierDialog
              triggerLabel="+ Supplier baru"
              onSaved={(supplier) => {
                setSuppliers((current) => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)));
                setSupplierId(supplier.id);
              }}
            />
          </div>
        </div>
        {branches.length > 1 ? (
          <div className="space-y-1">
            <Label htmlFor="purchase-branch">Cabang penerima</Label>
            <select id="purchase-branch" className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Cabang penerima: {branches[0]?.name}</p>
        )}
        <div className="space-y-1">
          <Label htmlFor="purchase-number">Nomor faktur</Label>
          <Input id="purchase-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="purchase-date">Tanggal faktur</Label>
          <Input id="purchase-date" type="date" max={today} value={invoiceDate} onChange={(e) => changeInvoiceDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="purchase-due">Jatuh tempo</Label>
          <Input
            id="purchase-due"
            type="date"
            min={invoiceDate}
            value={dueDate}
            onChange={(e) => {
              setDueTouched(true);
              setDueDate(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="purchase-notes">Catatan</Label>
          <Input id="purchase-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Barang di faktur">
        {lines.map((line, index) => {
          const n = index + 1;
          const unit = byId.get(line.itemId)?.unit;
          return (
            <fieldset key={line.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6">
              <legend className="px-1 text-sm font-medium">Baris {n}</legend>
              <select
                aria-label={`Barang baris ${n}`}
                className={`${selectClass} sm:col-span-2`}
                value={line.itemId}
                onChange={(e) => update(line.key, { itemId: e.target.value })}
              >
                <option value="">Pilih barang</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
              <Input
                aria-label={`Jumlah baris ${n}`}
                type="number"
                min={1}
                inputMode="numeric"
                placeholder={unit ? `Jumlah (${unit})` : "Jumlah"}
                value={line.quantity}
                onChange={(e) => update(line.key, { quantity: e.target.value })}
              />
              <RupiahInput
                aria-label={`Harga beli baris ${n}`}
                placeholder="Harga beli per satuan"
                value={line.unitCost}
                onChange={(next) => update(line.key, { unitCost: next })}
              />
              <Input
                aria-label={`Batch baris ${n}`}
                placeholder="Nomor batch"
                value={line.batchNumber}
                onChange={(e) => update(line.key, { batchNumber: e.target.value })}
              />
              <Input
                aria-label={`Kedaluwarsa baris ${n}`}
                type="date"
                min={today}
                value={line.expiryDate}
                onChange={(e) => update(line.key, { expiryDate: e.target.value })}
              />
              {lines.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="justify-self-start sm:col-span-6"
                  aria-label={`Hapus baris ${n}`}
                  onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                >
                  Hapus
                </Button>
              )}
            </fieldset>
          );
        })}
        <Button type="button" variant="outline" onClick={addLine}>
          + Tambah baris
        </Button>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm" aria-live="polite">
          Total faktur: <strong className="text-base">{formatRupiah(total)}</strong>
        </p>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan barang masuk"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

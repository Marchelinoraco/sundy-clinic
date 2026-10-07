"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_NOTE_MAX, validateRecurring, validateRecurringUpdate } from "@/lib/expense";
import { createRecurringExpense, updateRecurringExpense } from "@/server/expense-recurring";
import type { CategoryRow, RecurringRow } from "@/server/expense-read";
import { RupiahInput } from "../rupiah-input";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Tambah (tanpa `row`) atau ubah (dengan `row`) templat pengeluaran berulang. Mengubah tidak menyentuh catatan lama. */
export function RecurringDialog({
  categories,
  branches,
  currentMonth,
  row,
}: {
  categories: CategoryRow[];
  branches: { id: string; name: string }[];
  currentMonth: string;
  row?: RecurringRow;
}) {
  const router = useRouter();
  const editing = Boolean(row);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(row?.categoryId ?? "");
  const [amount, setAmount] = useState<number | null>(row?.amount ?? null);
  const [branchId, setBranchId] = useState(row?.branchId ?? "");
  const [note, setNote] = useState(row?.note ?? "");
  const [day, setDay] = useState(String(row?.dayOfMonth ?? 1));
  const [startMonth, setStartMonth] = useState(row?.startMonth ?? currentMonth);
  const [endMonth, setEndMonth] = useState(row?.endMonth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const common = { amount: amount ?? Number.NaN, note, dayOfMonth: Number(day), endMonth: endMonth || null };
    const checked = row
      ? validateRecurringUpdate(common, { startMonth: row.startMonth })
      : validateRecurring({ ...common, categoryId, branchId: branchId || null, startMonth }, { currentMonth });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = row
          ? await updateRecurringExpense({ id: row.id, ...common })
          : await createRecurringExpense({ ...common, categoryId, branchId: branchId || null, startMonth });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(row ? "Templat diperbarui." : "Templat dibuat.");
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
        {row ? (
          <Button type="button" size="sm" variant="ghost" aria-label={`Ubah ${row.categoryName}`}>
            Ubah
          </Button>
        ) : (
          <Button type="button">+ Berulang</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Ubah pengeluaran berulang" : "Pengeluaran berulang"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Perubahan hanya berlaku untuk bulan-bulan berikutnya; catatan yang sudah ada tidak berubah."
              : "Catatan dibuat otomatis tiap bulan, mulai dari bulan mulai (bulan yang sudah lewat langsung disusulkan)."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!editing && (
            <div className="space-y-1">
              <Label htmlFor="recurring-category">Kategori</Label>
              <select id="recurring-category" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Pilih kategori…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="recurring-amount">Nominal</Label>
            <RupiahInput id="recurring-amount" value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="recurring-day">Tanggal tiap bulan</Label>
            <Input id="recurring-day" type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          {!editing && (
            <div className="space-y-1">
              <Label htmlFor="recurring-start">Bulan mulai</Label>
              <Input id="recurring-start" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="recurring-end">Bulan berakhir (opsional)</Label>
            <Input id="recurring-end" type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </div>
          {!editing && (
            <div className="space-y-1">
              <Label htmlFor="recurring-branch">Cabang</Label>
              <select id="recurring-branch" className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Umum (semua cabang)</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="recurring-note">Keterangan (opsional)</Label>
            <Input id="recurring-note" maxLength={EXPENSE_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
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

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_NOTE_MAX, validateExpense } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { createExpense } from "@/server/expense-actions";
import type { CategoryRow } from "@/server/expense-read";
import { RupiahInput } from "../rupiah-input";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Catat satu pengeluaran (spec laporan 7). Cabang kosong berarti pengeluaran umum. */
export function ExpenseFormDialog({ categories, branches, today }: { categories: CategoryRow[]; branches: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [branchId, setBranchId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setDate(today);
    setCategoryId("");
    setAmount(null);
    setBranchId("");
    setNote("");
    setError(null);
  }

  function save() {
    const input = { date, categoryId, amount: amount ?? Number.NaN, note, branchId: branchId || null };
    const checked = validateExpense(input, { today });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createExpense(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Pengeluaran ${formatRupiah(checked.value.amount)} dicatat.`);
        setOpen(false);
        reset();
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
        <Button type="button">+ Pengeluaran</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat pengeluaran</DialogTitle>
          <DialogDescription>Salah catat dibatalkan dengan alasan, tidak dihapus.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="expense-date">Tanggal</Label>
            <Input id="expense-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expense-category">Kategori</Label>
            <select id="expense-category" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Pilih kategori…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="expense-amount">Nominal</Label>
            <RupiahInput id="expense-amount" value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expense-branch">Cabang</Label>
            <select id="expense-branch" className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Umum (semua cabang)</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="expense-note">Keterangan (opsional)</Label>
            <Input id="expense-note" maxLength={EXPENSE_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
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

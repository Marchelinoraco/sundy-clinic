"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EXPENSE_NOTE_MAX, validateExpense } from "@/lib/expense";
import { formatRupiah } from "@/lib/format";
import { createExpense } from "@/server/expense-actions";
import type { CategoryRow } from "@/server/expense-read";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

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

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button type="button" variant="contained" onClick={() => setOpen(true)}>
        + Pengeluaran
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>Catat pengeluaran</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>Salah catat dibatalkan dengan alasan, tidak dihapus.</DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <DateField id="expense-date" label="Tanggal" max={today} value={date} onChange={setDate} fullWidth />
            <SelectField id="expense-category" label="Kategori" value={categoryId} onChange={setCategoryId}>
              <option value="">Pilih kategori…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
            <RupiahInput id="expense-amount" label="Nominal" value={amount} onChange={setAmount} fullWidth />
            <SelectField id="expense-branch" label="Cabang" value={branchId} onChange={setBranchId}>
              <option value="">Umum (semua cabang)</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </SelectField>
            <TextField
              id="expense-note"
              label="Keterangan (opsional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { maxLength: EXPENSE_NOTE_MAX } }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

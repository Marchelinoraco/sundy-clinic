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
import { EXPENSE_NOTE_MAX, validateRecurring, validateRecurringUpdate } from "@/lib/expense";
import { createRecurringExpense, updateRecurringExpense } from "@/server/expense-recurring";
import type { CategoryRow, RecurringRow } from "@/server/expense-read";
import { MonthField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

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

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      {row ? (
        <Button type="button" size="small" variant="text" aria-label={`Ubah ${row.categoryName}`} onClick={() => setOpen(true)}>
          Ubah
        </Button>
      ) : (
        <Button type="button" variant="contained" onClick={() => setOpen(true)}>
          + Berulang
        </Button>
      )}
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{editing ? "Ubah pengeluaran berulang" : "Pengeluaran berulang"}</DialogTitle>
        <DialogCloseButton onClick={close} />
        <DialogContent>
          <DialogContentText>
            {editing
              ? "Perubahan hanya berlaku untuk bulan-bulan berikutnya; catatan yang sudah ada tidak berubah."
              : "Catatan dibuat otomatis tiap bulan, mulai dari bulan mulai (bulan yang sudah lewat langsung disusulkan)."}
          </DialogContentText>
          <Stack spacing={2} sx={{ pt: 2 }}>
            {!editing && (
              <SelectField id="recurring-category" label="Kategori" value={categoryId} onChange={setCategoryId}>
                <option value="">Pilih kategori…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectField>
            )}
            <RupiahInput id="recurring-amount" label="Nominal" value={amount} onChange={setAmount} fullWidth />
            <TextField
              id="recurring-day"
              label="Tanggal tiap bulan"
              type="number"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { min: 1, max: 28 } }}
            />
            {!editing && <MonthField id="recurring-start" label="Bulan mulai" value={startMonth} onChange={setStartMonth} fullWidth />}
            <MonthField id="recurring-end" label="Bulan berakhir (opsional)" value={endMonth} onChange={setEndMonth} fullWidth />
            {!editing && (
              <SelectField id="recurring-branch" label="Cabang" value={branchId} onChange={setBranchId}>
                <option value="">Umum (semua cabang)</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </SelectField>
            )}
            <TextField
              id="recurring-note"
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

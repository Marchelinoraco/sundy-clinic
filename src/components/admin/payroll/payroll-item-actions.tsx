"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { formatRupiah } from "@/lib/format";
import { validateAdjustment, validateAmounts } from "@/lib/payroll";
import {
  addPayrollAdjustment,
  payPayrollItem,
  removePayrollAdjustment,
  removePayrollItem,
  updatePayrollAmounts,
  voidPayrollPayment,
} from "@/server/payroll-actions";
import type { PayrollItemRow } from "@/server/payroll-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { DateField } from "../mui/date-field";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

type Run = (action: () => Promise<ActionResult<unknown>>, done: string, onOk?: () => void) => void;

function useRun(setError: (message: string | null) => void): [Run, boolean] {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run: Run = (action, done, onOk) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(done);
        onOk?.();
        router.refresh();
      } catch {
        setError("Aksi gagal. Coba lagi.");
      }
    });
  };
  return [run, pending];
}


function ActionDialog({ text, name, open, setOpen, children, actions }: { text: string; name: string; open: boolean; setOpen: (open: boolean) => void; children: ReactNode; actions: ReactNode }) {
  return (
    <>
      <Button type="button" size="small" variant="text" onClick={() => setOpen(true)} aria-label={`${text} ${name}`}>
        {text}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>{`${text} — ${name}`}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {children}
          </Stack>
        </DialogContent>
        <DialogActions>{actions}</DialogActions>
      </Dialog>
    </>
  );
}

function AdjustmentsDialog({ item }: { item: PayrollItemRow }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"BONUS" | "POTONGAN">("POTONGAN");
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);

  function add() {
    const checked = validateAdjustment({ kind, amount: amount ?? Number.NaN, note });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    run(() => addPayrollAdjustment({ itemId: item.id, ...checked.value }), "Penyesuaian ditambahkan.", () => {
      setAmount(null);
      setNote("");
    });
  }

  return (
    <ActionDialog text="Penyesuaian" name={item.employeeName} open={open} setOpen={setOpen} actions={
      <Button type="button" variant="contained" disabled={pending} onClick={add}>
        Tambah
      </Button>
    }>
      {item.adjustments.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Belum ada bonus atau potongan.
        </Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {item.adjustments.map((a) => (
            <li key={a.id}>
              <Typography variant="body2" component="span">
                {a.note}: {a.kind === "BONUS" ? "+" : "−"}
                {formatRupiah(a.amount)}
              </Typography>
              {!a.automatic && (
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => removePayrollAdjustment({ adjustmentId: a.id }), "Penyesuaian dihapus.")} aria-label={`Hapus ${a.note}`}>
                  Hapus
                </Button>
              )}
            </li>
          ))}
        </Box>
      )}
      <SelectField id={`adj-kind-${item.id}`} label="Jenis" value={kind} onChange={(v) => setKind(v as "BONUS" | "POTONGAN")}>
        <option value="POTONGAN">Potongan</option>
        <option value="BONUS">Bonus</option>
      </SelectField>
      <RupiahInput id={`adj-amount-${item.id}`} label="Nominal" value={amount} onChange={setAmount} fullWidth />
      <TextField id={`adj-note-${item.id}`} label="Keterangan" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
    </ActionDialog>
  );
}

function AmountsDialog({ item }: { item: PayrollItemRow }) {
  const [open, setOpen] = useState(false);
  const [baseSalary, setBaseSalary] = useState<number | null>(item.baseSalary);
  const [allowance, setAllowance] = useState<number | null>(item.allowance);
  const [note, setNote] = useState(item.amountNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);

  function save() {
    const input = { baseSalary: baseSalary ?? Number.NaN, allowance: allowance ?? Number.NaN, note };
    // Alasan diperiksa lengkap di server terhadap data karyawan; di sini cukup bentuk nominal.
    const checked = validateAmounts(input, { baseSalary: input.baseSalary, allowance: input.allowance });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    run(() => updatePayrollAmounts({ itemId: item.id, ...input }), "Gaji bulan ini tersimpan.", () => setOpen(false));
  }

  return (
    <ActionDialog text="Ubah gaji" name={item.employeeName} open={open} setOpen={setOpen} actions={
      <Button type="button" variant="contained" disabled={pending} onClick={save}>
        Simpan
      </Button>
    }>
      <RupiahInput id={`amt-salary-${item.id}`} label="Gaji pokok bulan ini" value={baseSalary} onChange={setBaseSalary} fullWidth />
      <RupiahInput id={`amt-allow-${item.id}`} label="Tunjangan bulan ini" value={allowance} onChange={setAllowance} fullWidth />
      <TextField id={`amt-note-${item.id}`} label="Alasan perubahan" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
    </ActionDialog>
  );
}

function PayDialog({ item, today }: { item: PayrollItemRow; today: string }) {
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);
  return (
    <ActionDialog text="Tandai dibayar" name={item.employeeName} open={open} setOpen={setOpen} actions={
      <Button type="button" variant="contained" disabled={pending} onClick={() => run(() => payPayrollItem({ itemId: item.id, paidOn }), `Gaji ${item.employeeName} dibayar.`, () => setOpen(false))}>
        Bayar
      </Button>
    }>
      <Typography variant="body2">
        Total dibayar: <strong>{formatRupiah(item.total)}</strong> (komisi {formatRupiah(item.commission)} dari {item.treatments} treatment). Pembayaran tercatat di Pengeluaran.
      </Typography>
      <DateField id={`pay-date-${item.id}`} label="Tanggal bayar" value={paidOn} onChange={setPaidOn} max={today} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
    </ActionDialog>
  );
}

function VoidDialog({ item }: { item: PayrollItemRow }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);
  return (
    <ActionDialog text="Batalkan pembayaran" name={item.employeeName} open={open} setOpen={setOpen} actions={
      <Button type="button" variant="contained" color="error" disabled={pending} onClick={() => run(() => voidPayrollPayment({ itemId: item.id, reason }), "Pembayaran dibatalkan.", () => setOpen(false))}>
        Batalkan pembayaran
      </Button>
    }>
      <Typography variant="body2">Pengeluaran gaji dan komisi ikut dibatalkan, dan komisinya kembali belum dibayar.</Typography>
      <TextField id={`void-reason-${item.id}`} label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
    </ActionDialog>
  );
}

/** Aksi satu baris penggajian (spec karyawan 4–5). */
export function PayrollItemActions({ item, today }: { month: string; item: PayrollItemRow; today: string }) {
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useRun(setError);
  if (item.paidAt) return <VoidDialog item={item} />;
  return (
    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
      <AdjustmentsDialog item={item} />
      <AmountsDialog item={item} />
      <PayDialog item={item} today={today} />
      <Button type="button" size="small" color="error" disabled={pending} onClick={() => run(() => removePayrollItem({ itemId: item.id }), `${item.employeeName} dikeluarkan dari daftar.`)} aria-label={`Keluarkan ${item.employeeName}`}>
        Keluarkan
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

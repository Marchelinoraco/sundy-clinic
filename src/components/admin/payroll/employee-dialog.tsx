"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { validateEmployee } from "@/lib/payroll";
import { createEmployee, updateEmployee } from "@/server/payroll-actions";
import type { EmployeeRow } from "@/server/payroll-read";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { DateField } from "../mui/date-field";
import { SelectField } from "../mui/select-field";
import { RupiahInput } from "../rupiah-input";

type Draft = {
  name: string; position: string; branchId: string; joinedOn: string; nik: string; npwp: string; whatsapp: string;
  bankName: string; bankAccount: string; bankHolder: string; notes: string; baseSalary: number | null; allowance: number | null; staffId: string;
};

const draftOf = (e?: EmployeeRow): Draft => ({
  name: e?.name ?? "", position: e?.position ?? "", branchId: e?.branchId ?? "", joinedOn: e?.joinedOn ?? "", nik: e?.nik ?? "", npwp: e?.npwp ?? "",
  whatsapp: e?.whatsapp ?? "", bankName: e?.bankName ?? "", bankAccount: e?.bankAccount ?? "", bankHolder: e?.bankHolder ?? "", notes: e?.notes ?? "",
  baseSalary: e?.baseSalary ?? null, allowance: e?.allowance ?? 0, staffId: e?.staffId ?? "",
});

/** Tambah atau ubah karyawan (spec karyawan 5). NIK dan rekening hanya tampil di dialog ini, tidak di tabel. */
export function EmployeeDialog({
  branches,
  staffOptions,
  employee,
}: {
  branches: { id: string; name: string }[];
  staffOptions: { id: string; name: string; employeeId: string | null }[];
  employee?: EmployeeRow;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(employee));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function openDialog() {
    setDraft(draftOf(employee));
    setError(null);
    setOpen(true);
  }

  function save() {
    const checked = validateEmployee({ ...draft, baseSalary: draft.baseSalary ?? Number.NaN, allowance: draft.allowance ?? Number.NaN });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = employee ? await updateEmployee({ id: employee.id, ...checked.value }) : await createEmployee(checked.value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(employee ? "Data karyawan tersimpan." : `${checked.value.name} ditambahkan.`);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <>
      {employee ? (
        <Button type="button" size="small" variant="text" onClick={openDialog} aria-label={`Ubah ${employee.name}`}>
          Ubah
        </Button>
      ) : (
        <Button type="button" variant="contained" onClick={openDialog}>
          + Karyawan
        </Button>
      )}
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>{employee ? `Ubah — ${employee.name}` : "Tambah karyawan"}</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField id={`${id}-name`} label="Nama" value={draft.name} onChange={(e) => set("name")(e.target.value)} fullWidth />
            <TextField id={`${id}-position`} label="Jabatan" value={draft.position} onChange={(e) => set("position")(e.target.value)} fullWidth />
            <SelectField id={`${id}-branch`} label="Cabang utama" value={draft.branchId} onChange={set("branchId")}>
              <option value="">Umum (semua cabang)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectField>
            <SelectField id={`${id}-staff`} label="Tautkan ke staf" value={draft.staffId} onChange={set("staffId")}>
              <option value="">Tidak ditautkan (tanpa akun panel)</option>
              {staffOptions.map((s) => {
                const taken = s.employeeId !== null && s.employeeId !== employee?.id;
                return (
                  <option key={s.id} value={s.id} disabled={taken}>
                    {taken ? `${s.name} (sudah tertaut)` : s.name}
                  </option>
                );
              })}
            </SelectField>
            <DateField id={`${id}-joined`} label="Tanggal masuk" value={draft.joinedOn} onChange={set("joinedOn")} fullWidth />
            <RupiahInput id={`${id}-salary`} label="Gaji pokok" value={draft.baseSalary} onChange={set("baseSalary")} fullWidth />
            <RupiahInput id={`${id}-allowance`} label="Tunjangan tetap" value={draft.allowance} onChange={set("allowance")} fullWidth />
            <TextField id={`${id}-wa`} label="Nomor WhatsApp" value={draft.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)} fullWidth />
            <TextField id={`${id}-nik`} label="NIK (opsional)" value={draft.nik} onChange={(e) => set("nik")(e.target.value)} fullWidth />
            <TextField id={`${id}-npwp`} label="NPWP (opsional)" value={draft.npwp} onChange={(e) => set("npwp")(e.target.value)} fullWidth />
            <TextField id={`${id}-bank`} label="Nama bank" value={draft.bankName} onChange={(e) => set("bankName")(e.target.value)} fullWidth />
            <TextField id={`${id}-account`} label="Nomor rekening" value={draft.bankAccount} onChange={(e) => set("bankAccount")(e.target.value)} fullWidth />
            <TextField id={`${id}-holder`} label="Atas nama" value={draft.bankHolder} onChange={(e) => set("bankHolder")(e.target.value)} fullWidth />
            <TextField id={`${id}-notes`} label="Catatan" value={draft.notes} onChange={(e) => set("notes")(e.target.value)} multiline minRows={2} fullWidth />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" disabled={pending} onClick={save}>
            Simpan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

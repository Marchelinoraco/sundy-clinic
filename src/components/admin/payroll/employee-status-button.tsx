"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Alert from "@mui/material/Alert";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setEmployeeStatus } from "@/server/payroll-actions";
import type { EmployeeRow } from "@/server/payroll-read";
import { DateField } from "../mui/date-field";

/** Berhentikan (dengan tanggal keluar) atau aktifkan kembali (spec karyawan 2.1). */
export function EmployeeStatusButton({ employee }: { employee: EmployeeRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leftOn, setLeftOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(status: "AKTIF" | "BERHENTI") {
    startTransition(async () => {
      try {
        const result = await setEmployeeStatus({ id: employee.id, status, leftOn: status === "BERHENTI" ? leftOn : null });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(status === "AKTIF" ? `${employee.name} aktif kembali.` : `${employee.name} diberhentikan.`);
        setOpen(false);
        router.refresh();
      } catch {
        setError("Aksi gagal. Coba lagi.");
      }
    });
  }

  if (employee.status === "BERHENTI") {
    return (
      <Button type="button" size="small" variant="text" disabled={pending} onClick={() => run("AKTIF")} aria-label={`Aktifkan kembali ${employee.name}`}>
        Aktifkan kembali
      </Button>
    );
  }
  return (
    <>
      <Button type="button" size="small" variant="text" color="error" onClick={() => { setError(null); setOpen(true); }} aria-label={`Berhentikan ${employee.name}`}>
        Berhentikan
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Berhentikan {employee.name}?</DialogTitle>
        <DialogContent>
          <DateField id={`left-${employee.id}`} label="Tanggal keluar" value={leftOn} onChange={setLeftOn} fullWidth />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setOpen(false)} disabled={pending}>
            Batal
          </Button>
          <Button type="button" variant="contained" color="error" onClick={() => run("BERHENTI")} disabled={pending}>
            Berhentikan
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

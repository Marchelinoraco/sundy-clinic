"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { addPayrollItem, createPayrollPeriod, deletePayrollPeriod } from "@/server/payroll-actions";
import { SelectField } from "../mui/select-field";

function useAction(): [(action: () => Promise<ActionResult<unknown>>, done: string, then?: () => void) => void, boolean, string | null] {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult<unknown>>, done: string, then?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(done);
        then?.();
        router.refresh();
      } catch {
        setError("Aksi gagal. Coba lagi.");
      }
    });
  };
  return [run, pending, error];
}

export function CreatePayrollButton({ month }: { month: string }) {
  const [run, pending, error] = useAction();
  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
      <Button type="button" variant="contained" disabled={pending} onClick={() => run(() => createPayrollPeriod({ month }), `Penggajian ${month} dibuat.`)}>
        Buat penggajian {month}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function DeletePayrollButton({ month }: { month: string }) {
  const router = useRouter();
  const [run, pending, error] = useAction();
  return (
    <Stack spacing={1} sx={{ alignItems: "flex-end" }}>
      <Button type="button" variant="outlined" color="error" disabled={pending} onClick={() => run(() => deletePayrollPeriod({ month }), `Penggajian ${month} dihapus.`, () => router.push("/admin/karyawan?tab=penggajian"))}>
        Hapus penggajian
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function AddEmployeeToPayroll({ month, options }: { month: string; options: { id: string; name: string }[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [run, pending, error] = useAction();
  if (options.length === 0) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
      <SelectField id="payroll-add" label="Tambah karyawan" value={employeeId} onChange={setEmployeeId} fullWidth={false} sx={{ minWidth: 220 }}>
        <option value="">Pilih karyawan</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
      <Button type="button" variant="outlined" disabled={pending || !employeeId} onClick={() => run(() => addPayrollItem({ month, employeeId }), "Karyawan ditambahkan.", () => setEmployeeId(""))}>
        Tambah
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

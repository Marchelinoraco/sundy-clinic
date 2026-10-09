"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { StaffRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { roleCanHaveLogin } from "@/lib/staff-accounts";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import { createStaffWithAccount, updateStaff, type Credentials, type StaffRow } from "@/server/staff";
import { SelectField } from "../mui/select-field";

const ROLES = Object.keys(STAFF_ROLE_LABEL) as StaffRole[];

/** Tambah staf (dengan akun bila perannya boleh) atau ubah nama, peran, dan tampil di situs (spec kelola staf 5.1). */
export function StaffFormDialog({
  mode,
  row,
  onClose,
  onCredentials,
}: {
  mode: "add" | "edit";
  row?: StaffRow;
  onClose: () => void;
  onCredentials: (name: string, credentials: Credentials) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(row?.name ?? "");
  const [role, setRole] = useState<StaffRole>(row?.role ?? "RESEPSIONIS");
  const [showOnWebsite, setShowOnWebsite] = useState(row?.showOnWebsite ?? false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const title = mode === "add" ? "Tambah staf" : `Ubah — ${row?.name ?? ""}`;
  const needsEmail = mode === "add" && roleCanHaveLogin(role);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "add") {
        const result = await createStaffWithAccount({ name, role, showOnWebsite, email: needsEmail ? email : undefined });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success("Staf ditambahkan.");
        router.refresh();
        if (result.data.credentials) onCredentials(name.trim(), result.data.credentials);
        else onClose();
        return;
      }
      const result = await updateStaff({ id: row!.id, name, role, showOnWebsite });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Perubahan disimpan.");
      router.refresh();
      onClose();
    } catch {
      setError("Aksi gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { component: "form", onSubmit: submit } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField id="staf-nama" label="Nama" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth />
          <SelectField id="staf-peran" label="Peran" value={role} onChange={(value) => setRole(value as StaffRole)}>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {STAFF_ROLE_LABEL[value]}
              </option>
            ))}
          </SelectField>
          <FormControlLabel control={<Switch checked={showOnWebsite} onChange={(e) => setShowOnWebsite(e.target.checked)} />} label="Tampil di situs publik" />
          {needsEmail && (
            <TextField
              id="staf-email"
              label="Email login"
              type="text"
              slotProps={{ htmlInput: { inputMode: "email" } }}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helperText="Kata sandi sementara dibuat otomatis dan tampil sekali setelah disimpan."
              fullWidth
            />
          )}
          {mode === "add" && !roleCanHaveLogin(role) && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Terapis tidak punya akun login.
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Batal</Button>
        <Button type="submit" variant="contained" disabled={pending}>
          {mode === "add" ? "Tambah staf" : "Simpan"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

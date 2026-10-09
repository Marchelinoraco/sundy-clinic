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
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { changeStaffEmail, createAccountForStaff, type Credentials, type StaffRow } from "@/server/staff";

/** "Buat akun" untuk staf tanpa akun, atau "Ganti email" untuk yang sudah punya (spec kelola staf 5.1). */
export function StaffEmailDialog({
  mode,
  row,
  isSelf = false,
  onClose,
  onCredentials,
}: {
  mode: "create" | "change";
  row: StaffRow;
  /** Mengganti email akun sendiri: sesi dicabut dan salah ketik mengunci pemilik, jadi email diketik dua kali. */
  isSelf?: boolean;
  onClose: () => void;
  onCredentials: (name: string, credentials: Credentials) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(mode === "change" ? (row.email ?? "") : "");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const label = mode === "create" ? "Buat akun" : "Ganti email";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const confirmSelf = mode === "change" && isSelf;
    if (confirmSelf && email.trim().toLowerCase() !== repeat.trim().toLowerCase()) {
      setError("Email ulangan tidak sama.");
      return;
    }
    setPending(true);
    try {
      if (mode === "create") {
        const result = await createAccountForStaff({ staffId: row.id, email });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        onCredentials(row.name, result.data.credentials);
        return;
      }
      const result = await changeStaffEmail({ staffId: row.id, email });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Email diganti. Staf keluar dari semua perangkat.");
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
      <DialogTitle>
        {label} — {row.name}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            id="staf-email-login"
            label="Email login"
            type="text"
              slotProps={{ htmlInput: { inputMode: "email" } }}
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            helperText={mode === "create" ? "Kata sandi sementara dibuat otomatis dan tampil sekali setelah disimpan." : "Staf keluar dari semua perangkat dan masuk lagi dengan email baru."}
            autoFocus
            fullWidth
          />
          {mode === "change" && isSelf && (
            <>
              <Alert severity="warning">Anda akan keluar dari semua perangkat dan harus masuk lagi dengan email baru. Pastikan email baru benar dan bisa Anda ingat.</Alert>
              <TextField id="staf-email-ulang" label="Ulangi email baru" type="text" slotProps={{ htmlInput: { inputMode: "email" } }} autoComplete="off" value={repeat} onChange={(e) => setRepeat(e.target.value)} fullWidth />
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Batal</Button>
        <Button type="submit" variant="contained" disabled={pending}>
          {label}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

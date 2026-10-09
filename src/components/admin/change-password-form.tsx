"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-accounts";
import { changeOwnPassword } from "@/server/own-password";

/** Formulir halaman Ganti kata sandi (spec kelola staf 5.3). */
export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await changeOwnPassword({ currentPassword, newPassword, confirmation });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <TextField id="kata-sandi-saat-ini" label="Kata sandi saat ini" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} fullWidth />
      <TextField
        id="kata-sandi-baru"
        label="Kata sandi baru"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        helperText={`Minimal ${MIN_PASSWORD_LENGTH} karakter.`}
        fullWidth
      />
      <TextField id="ulangi-kata-sandi-baru" label="Ulangi kata sandi baru" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} fullWidth />
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" size="large" fullWidth disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan kata sandi baru"}
      </Button>
    </Box>
  );
}

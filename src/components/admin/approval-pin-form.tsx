"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { setOwnApprovalPin } from "@/server/approval-pin";

const MISMATCH = "PIN baru dan ulangannya tidak sama.";
// "one-time-code": Chrome dan Edge mengabaikan autocomplete="off" pada kolom kata sandi dan menawarkan menyimpan PIN.
const pinProps = { htmlInput: { inputMode: "numeric" as const, maxLength: 6, autoComplete: "one-time-code" } };

/** Membuat atau mengganti PIN persetujuan sendiri (spec PIN P8). */
export function ApprovalPinForm({ hasPin }: { hasPin: boolean }) {
  const router = useRouter();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPin !== again) {
      setError(MISMATCH);
      return;
    }
    setPending(true);
    try {
      const result = await setOwnApprovalPin(hasPin ? { currentPin, newPin } : { newPin });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentPin("");
      setNewPin("");
      setAgain("");
      toast.success("PIN persetujuan disimpan.");
      router.refresh();
    } catch {
      setError("Gagal menyimpan. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 360 }}>
      {hasPin && (
        <TextField id="pin-lama" label="PIN lama" type="password" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} slotProps={pinProps} />
      )}
      <TextField id="pin-baru" label="PIN baru" type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} helperText="6 angka." slotProps={pinProps} />
      <TextField id="ulangi-pin-baru" label="Ulangi PIN baru" type="password" value={again} onChange={(e) => setAgain(e.target.value)} slotProps={pinProps} />
      {error && <Alert severity="error">{error}</Alert>}
      <Box>
        <Button type="submit" variant="contained" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan PIN"}
        </Button>
      </Box>
    </Box>
  );
}

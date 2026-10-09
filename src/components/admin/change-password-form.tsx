"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-accounts";
import { changeOwnPassword } from "@/server/own-password";

type Field = "current" | "next" | "again";

/** Isian mana yang bermasalah menurut pesan galat; yang tidak dikenali tidak menandai isian mana pun. */
function invalidFields(error: string | null): Field[] {
  if (!error) return [];
  if (error.includes("saat ini")) return ["current"];
  if (error.includes("baru") || error.includes("ulangan")) return ["next", "again"];
  return [];
}

/** Formulir halaman Ganti kata sandi (spec kelola staf 5.3). `email` hanya untuk pengelola kata sandi peramban. */
export function ChangePasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const errorId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const invalid = invalidFields(error);
  const describe = (field: Field) => (invalid.includes(field) ? { "aria-describedby": errorId } : {});

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
      {/* Isian username untuk pengelola kata sandi: tanpanya kata sandi baru tersimpan tanpa email. Tak terlihat dan tak bisa difokus. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
      />
      <TextField
        id="kata-sandi-saat-ini"
        label="Kata sandi saat ini"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        error={invalid.includes("current")}
        slotProps={{ htmlInput: describe("current") }}
        fullWidth
      />
      <TextField
        id="kata-sandi-baru"
        label="Kata sandi baru"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        helperText={`Minimal ${MIN_PASSWORD_LENGTH} karakter.`}
        error={invalid.includes("next")}
        slotProps={{ htmlInput: describe("next") }}
        fullWidth
      />
      <TextField
        id="ulangi-kata-sandi-baru"
        label="Ulangi kata sandi baru"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        error={invalid.includes("again")}
        slotProps={{ htmlInput: describe("again") }}
        fullWidth
      />
      {error && (
        <Alert id={errorId} severity="error">
          {error}
        </Alert>
      )}
      <Button type="submit" variant="contained" size="large" fullWidth disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan kata sandi baru"}
      </Button>
    </Box>
  );
}

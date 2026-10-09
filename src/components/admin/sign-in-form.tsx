"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);

    if (!email) {
      setFieldError("Email wajib diisi.");
      return;
    }

    setPending(true);
    const result = await signIn.email({ email, password });
    setPending(false);

    if (result.error) {
      // Satu pesan untuk semua kegagalan. Membedakan "email tidak terdaftar"
      // dari "kata sandi salah" memberi tahu penyerang alamat mana yang ada.
      setFormError("Email atau kata sandi salah.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={Boolean(fieldError)}
        helperText={fieldError ?? undefined}
        fullWidth
      />
      <TextField id="password" label="Kata Sandi" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
      {formError && <Alert severity="error">{formError}</Alert>}
      <Button type="submit" variant="contained" size="large" fullWidth disabled={pending}>
        {pending ? "Memproses…" : "Masuk"}
      </Button>
    </Box>
  );
}

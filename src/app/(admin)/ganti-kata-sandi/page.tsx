import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { getCurrentStaff, getPendingPasswordChange } from "@/server/session";

export const metadata: Metadata = {
  title: "Ganti kata sandi",
  robots: { index: false, follow: false },
};

/** Di luar layout /admin (tanpa menu panel): hanya untuk akun yang wajib membuat kata sandi sendiri. */
export default async function ChangePasswordPage() {
  const pending = await getPendingPasswordChange();
  if (!pending) redirect((await getCurrentStaff()) ? "/admin" : "/masuk");

  return (
    <Box sx={{ minHeight: "100svh", display: "grid", placeItems: "center", px: 2, bgcolor: "background.default" }}>
      <Card sx={{ width: "100%", maxWidth: 420, p: 4 }}>
        <Typography variant="h1" sx={{ fontSize: "1.75rem" }}>
          Buat kata sandi baru
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, mb: 3 }}>
          {CLINIC_FULL_NAME} · {pending.email}. Kata sandi sementara dari pemilik hanya berlaku untuk masuk pertama. Buat kata sandi yang hanya Anda yang tahu.
        </Typography>
        <ChangePasswordForm />
        <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
          <SignOutButton />
        </Box>
      </Card>
    </Box>
  );
}

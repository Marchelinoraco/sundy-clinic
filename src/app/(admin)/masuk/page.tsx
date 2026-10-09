import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SignInForm } from "@/components/admin/sign-in-form";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { getCurrentStaff, getPendingPasswordChange } from "@/server/session";

export const metadata: Metadata = {
  title: "Masuk",
  // Halaman login tidak boleh terindeks mesin pencari.
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  // Akun yang wajib ganti kata sandi tidak dianggap login; arahkan ke halaman penggantiannya, bukan memperlihatkan formulir masuk lagi.
  if (await getPendingPasswordChange()) redirect("/ganti-kata-sandi");
  if (await getCurrentStaff()) redirect("/admin");

  return (
    <Box sx={{ minHeight: "100svh", display: "grid", placeItems: "center", px: 2, bgcolor: "background.default" }}>
      <Card sx={{ width: "100%", maxWidth: 384, p: 4 }}>
        <Typography variant="h1" sx={{ fontSize: "1.75rem" }}>
          Panel Admin
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, mb: 3 }}>
          {CLINIC_FULL_NAME}
        </Typography>
        <SignInForm />
      </Card>
    </Box>
  );
}

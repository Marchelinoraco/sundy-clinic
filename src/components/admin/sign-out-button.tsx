"use client";

import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

/** Tombol Keluar untuk halaman tanpa menu panel (mis. Ganti kata sandi). */
export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="text"
      color="inherit"
      onClick={async () => {
        await signOut();
        router.push("/masuk");
        router.refresh();
      }}
    >
      Keluar
    </Button>
  );
}

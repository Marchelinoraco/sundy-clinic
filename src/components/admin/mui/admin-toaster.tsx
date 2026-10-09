"use client";

import { useColorScheme } from "@mui/material/styles";
import { Toaster } from "sonner";

/** Pop-up sonner mengikuti skema warna MUI (spec MUI 4); posisi kanan atas seperti sebelumnya. */
export function AdminToaster() {
  const { mode, systemMode } = useColorScheme();
  const resolved = mode === "system" ? systemMode : mode;
  return <Toaster position="top-right" theme={resolved === "dark" ? "dark" : "light"} closeButton />;
}

"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import ScopedCssBaseline from "@mui/material/ScopedCssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import "dayjs/locale/id";
import type { ReactNode } from "react";
import { MODE_STORAGE_KEY } from "@/lib/color-mode";
import { PICKERS_LOCALE_ID } from "./locale";
import { adminTheme } from "./theme";

/**
 * Provider MUI khusus panel admin (spec MUI 3.2). Gaya Emotion masuk lapisan CSS `mui` sehingga urutannya
 * terhadap Tailwind terkendali; `ScopedCssBaseline` (bukan `CssBaseline`) supaya reset global tidak tertinggal
 * di situs publik setelah berpindah halaman.
 */
export function AdminProviders({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "mui", enableCssLayer: true }}>
      <ThemeProvider theme={adminTheme} defaultMode="system" modeStorageKey={MODE_STORAGE_KEY} disableTransitionOnChange>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="id" localeText={PICKERS_LOCALE_ID}>
          {/* `cetak-terang`: semua halaman admin tercetak terang (globals.css), apa pun skema layarnya. */}
          <ScopedCssBaseline className="cetak-terang" enableColorScheme sx={{ minHeight: "100svh", bgcolor: "background.default", color: "text.primary" }}>
            {children}
          </ScopedCssBaseline>
        </LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}

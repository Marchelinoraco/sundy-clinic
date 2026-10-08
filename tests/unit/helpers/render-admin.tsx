import { ThemeProvider } from "@mui/material/styles";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { render, type RenderOptions } from "@testing-library/react";
import "dayjs/locale/id";
import type { ReactElement, ReactNode } from "react";
import { PICKERS_LOCALE_ID } from "@/components/admin/mui/locale";
import { adminTheme } from "@/components/admin/mui/theme";
import { MODE_STORAGE_KEY } from "@/lib/color-mode";

export function AdminTestProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={adminTheme} defaultMode="system" modeStorageKey={MODE_STORAGE_KEY}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="id" localeText={PICKERS_LOCALE_ID}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}

/** Render komponen admin dengan tema dan pemilih tanggal, seperti di layout admin. */
export function renderAdmin(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AdminTestProviders, ...options });
}

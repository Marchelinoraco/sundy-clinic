import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import type { ReactNode } from "react";
import { AdminProviders } from "@/components/admin/mui/admin-providers";
import { COLOR_SCHEME_SELECTOR, MODE_STORAGE_KEY } from "@/lib/color-mode";

/** Layout grup admin (/admin/** dan /masuk): MUI dan skema warna hanya di sini, bukan di situs publik. */
export default function AdminGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Menetapkan skema sebelum halaman tampil, supaya mode gelap tidak berkedip terang. */}
      <InitColorSchemeScript attribute={COLOR_SCHEME_SELECTOR} defaultMode="system" modeStorageKey={MODE_STORAGE_KEY} />
      <AdminProviders>{children}</AdminProviders>
    </>
  );
}

import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { TextLink } from "./mui/links";

export type Crumb = { label: string; href?: string };

/** Kepala halaman (spec D 3.1): satu-satunya <h1>, keterangan, jejak opsional, aksi di kanan (turun di layar sempit). */
export function PageHeader({ title, description, trail, actions }: { title: string; description?: ReactNode; trail?: Crumb[]; actions?: ReactNode }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-end" } }}>
      <Box sx={{ minWidth: 0 }}>
        {trail && trail.length > 0 && (
          <Breadcrumbs aria-label="Jejak halaman" separator="›" sx={{ fontSize: "0.875rem", mb: 0.5 }}>
            {trail.map((crumb, index) => {
              const last = index === trail.length - 1;
              return crumb.href && !last ? (
                <TextLink key={`${crumb.label}-${index}`} href={crumb.href} color="text.secondary">
                  {crumb.label}
                </TextLink>
              ) : (
                <Typography key={`${crumb.label}-${index}`} component="span" aria-current={last ? "page" : undefined} sx={{ fontSize: "inherit", color: last ? "text.primary" : "text.secondary" }}>
                  {crumb.label}
                </Typography>
              );
            })}
          </Breadcrumbs>
        )}
        <Typography variant="h1">{title}</Typography>
        {description && (
          <Typography component="div" variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * Jarak tepi dan lebar isi yang sama di semua halaman. Halaman kunjungan memakai `wide`. Jarak bawah lebih
 * besar supaya isi terakhir bisa digulir ke atas tombol bunyi notifikasi yang mengambang di pojok kanan bawah.
 */
export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <Box
      sx={{
        mx: "auto",
        width: "100%",
        maxWidth: wide ? "none" : 1152,
        pt: { xs: 2, sm: 3 },
        px: { xs: 2, sm: 3 },
        pb: 10,
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      {children}
    </Box>
  );
}

/** Kartu bagian: judul (h2), aksi kecil di kanan, lalu isi. `flush` untuk tabel yang menempel ke tepi kartu. */
export function SectionCard({
  title,
  description,
  actions,
  flush = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  /** Tidak dipakai lagi; dipertahankan agar pemanggil lama tetap terkompilasi selama migrasi (dihapus di Task 13). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card component="section" aria-label={title} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, py: 1.5, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h2" component="h2">
            {title}
          </Typography>
          {description && (
            <Typography component="div" variant="caption" sx={{ color: "text.secondary" }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", fontSize: "0.875rem" }}>
            {actions}
          </Stack>
        )}
      </Stack>
      <Divider />
      <Box sx={flush ? { minWidth: 0, overflowX: "auto" } : { minWidth: 0, p: 2 }}>{children}</Box>
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ px: 2, py: 3, textAlign: "center", color: "text.secondary" }}>
      {children}
    </Typography>
  );
}

/** Bagian dasbor yang gagal dimuat (spec D 4.7). */
export function FailedSection({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <EmptyState>Gagal dimuat. Muat ulang halaman.</EmptyState>
    </SectionCard>
  );
}

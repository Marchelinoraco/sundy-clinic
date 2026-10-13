"use client";

import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { formatRupiah } from "@/lib/format";
import { siteServicePhotoPreviewUrl } from "@/lib/service-catalog";
import type { SiteCategory, SiteServiceRow } from "@/server/catalog-admin-read";
import { setSiteServiceActive } from "@/server/site-service-admin";
import { SectionCard } from "../page-layout";
import { ActiveToggleButton } from "./active-toggle-button";
import { SiteServiceDialog, type SiteServiceOption } from "./site-service-dialog";

function statusOf(row: SiteServiceRow): string {
  if (!row.isActive) return "Nonaktif";
  if (!row.serviceActive) return "Tersembunyi: layanan internal nonaktif";
  return "Tampil";
}

/** Daftar layanan situs per kategori (spec layanan situs 5.2). */
export function SiteServiceTable({ categories, categoryOptions, services }: { categories: SiteCategory[]; categoryOptions: { id: string; name: string }[]; services: SiteServiceOption[] }) {
  return (
    <Stack spacing={2}>
      {categories.map((category) => (
        <SectionCard key={category.id} title={category.name} description={`${category.services.length} layanan situs`} flush>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Foto</TableCell>
                  <TableCell>Nama di situs</TableCell>
                  <TableCell>Layanan internal</TableCell>
                  <TableCell>Signature</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {category.services.map((row) => {
                  const photo = siteServicePhotoPreviewUrl(row.imageUrl) ?? (row.imageUrl?.startsWith("/") ? row.imageUrl : null);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        {photo ? (
                          <Box component="img" src={photo} alt="" sx={{ width: 56, height: 42, objectFit: "cover", borderRadius: 1, display: "block" }} />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {row.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          /layanan/{row.slug}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {row.serviceName} · {formatRupiah(row.servicePrice)}
                      </TableCell>
                      <TableCell>{row.isSignature ? "Ya" : "—"}</TableCell>
                      <TableCell>{statusOf(row)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", alignItems: "center" }}>
                          {row.isActive && row.serviceActive && (
                            <MuiLink href={`/layanan/${row.slug}`} target="_blank" rel="noopener" variant="body2">
                              Lihat di situs
                            </MuiLink>
                          )}
                          <SiteServiceDialog categories={categoryOptions} services={services} row={row} />
                          <ActiveToggleButton
                            name={row.name}
                            active={row.isActive}
                            confirmText="Halaman layanan ini hilang dari situs. Layanan internalnya tetap bisa dipakai di booking admin dan tagihan."
                            onToggle={(active) => setSiteServiceActive({ id: row.id, active })}
                          />
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
      ))}
    </Stack>
  );
}

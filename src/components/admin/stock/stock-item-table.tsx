"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { formatRupiah } from "@/lib/format";
import { STOCK_FLAG_LABEL, STOCK_ITEM_KIND_LABEL, type StockFlag } from "@/lib/stock";
import { promoLabel } from "@/lib/stock-promo";
import type { StockItemRow } from "@/server/stock-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { TextLink } from "../mui/links";
import { StatusChip, type StatusTone } from "../mui/status-chip";

const FLAG_TONE: Record<StockFlag, StatusTone> = { MENIPIS: "warning", SEGERA_KEDALUWARSA: "warning", KEDALUWARSA: "error", MEJA_MENIPIS: "warning", MEJA_HABIS: "error" };

const COLUMNS: GridColDef<StockItemRow>[] = [
  {
    field: "code",
    headerName: "Kode",
    width: 120,
    renderCell: ({ row }) => (
      <Typography component="span" sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>
        {row.code}
      </Typography>
    ),
  },
  {
    field: "name",
    headerName: "Barang",
    flex: 1,
    minWidth: 200,
    renderCell: ({ row }) => (
      <Box>
        <TextLink href={`/admin/stok/barang/${row.id}`} sx={{ fontWeight: 500 }}>
          {row.name}
        </TextLink>
        {(row.flags.length > 0 || !row.isActive) && (
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ mt: 0.5, flexWrap: "wrap" }}>
            {row.flags.map((flag) => (
              <StatusChip key={flag} label={STOCK_FLAG_LABEL[flag]} tone={FLAG_TONE[flag]} />
            ))}
            {!row.isActive && <StatusChip label="Nonaktif" />}
          </Stack>
        )}
      </Box>
    ),
  },
  { field: "kind", headerName: "Jenis", minWidth: 110, valueGetter: (_value, row) => STOCK_ITEM_KIND_LABEL[row.kind] },
  {
    field: "available",
    headerName: "Gudang",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 130,
    renderCell: ({ row }) => (
      <Box>
        <Box>
          {row.available} {row.unit}
        </Box>
        {row.onHand > row.available && <Box sx={{ fontSize: "0.75rem", color: "error.main" }}>{row.onHand - row.available} kedaluwarsa</Box>}
      </Box>
    ),
  },
  {
    field: "counterAvailable",
    headerName: "Meja",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 120,
    renderCell: ({ row }) => (
      <Box>
        <Box>
          {row.counterAvailable} {row.unit}
        </Box>
        {row.counterExpired > 0 && <Box sx={{ fontSize: "0.75rem", color: "error.main" }}>{row.counterExpired} kedaluwarsa</Box>}
      </Box>
    ),
  },
  {
    field: "sellPrice",
    headerName: "Harga jual",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 160,
    renderCell: ({ row }) => {
      const promo = promoLabel(row);
      return (
        <Box sx={{ lineHeight: 1.3, py: 0.5 }}>
          {row.sellPrice === null ? (
            <Box component="span" sx={{ color: "warning.main" }}>
              Belum diisi
            </Box>
          ) : (
            formatRupiah(row.sellPrice)
          )}
          {promo && (
            <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
              {promo}
            </Typography>
          )}
        </Box>
      );
    },
  },
];

/** Daftar barang satu cabang (spec stok 5.1). */
export function StockItemTable({ rows }: { rows: StockItemRow[] }) {
  return <AdminDataGrid rows={rows} columns={COLUMNS} label="Daftar barang" emptyText="Tidak ada barang yang cocok." />;
}

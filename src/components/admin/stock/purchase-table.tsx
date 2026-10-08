"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { formatRupiah } from "@/lib/format";
import { dateLabel, dateOnly, PAYABLE_STATUS_LABEL } from "@/lib/stock";
import type { PurchaseRow } from "@/server/purchase-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { TextLink } from "../mui/links";
import { PayableStatusBadge } from "./payable-status-badge";

const COLUMNS: GridColDef<PurchaseRow>[] = [
  {
    field: "invoiceDate",
    headerName: "Tanggal",
    type: "dateTime",
    width: 130,
    valueGetter: (_value, row) => dateOnly(row.invoiceDate),
    renderCell: ({ row }) => dateLabel(row.invoiceDate),
  },
  {
    field: "invoiceNumber",
    headerName: "Faktur",
    flex: 1,
    minWidth: 180,
    renderCell: ({ row }) => (
      <Box>
        <TextLink href={`/admin/stok/masuk/${row.id}`} sx={{ fontWeight: 500 }}>
          {row.invoiceNumber}
        </TextLink>
        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
          {row.supplierName} · {row.lineCount} baris
        </Typography>
      </Box>
    ),
  },
  { field: "branchName", headerName: "Cabang", flex: 1, minWidth: 120 },
  {
    field: "total",
    headerName: "Total",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 130,
    renderCell: ({ row }) => formatRupiah(row.total),
  },
  {
    field: "status",
    headerName: "Status",
    minWidth: 150,
    valueGetter: (_value, row) => PAYABLE_STATUS_LABEL[row.status],
    renderCell: ({ row }) => <PayableStatusBadge status={row.status} overdue={row.overdue} />,
  },
];

/** Tab "Barang masuk": faktur terbaru di atas. */
export function PurchaseTable({ rows }: { rows: PurchaseRow[] }) {
  return <AdminDataGrid rows={rows} columns={COLUMNS} label="Daftar barang masuk" emptyText="Belum ada barang masuk." />;
}

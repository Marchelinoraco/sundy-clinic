"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { formatRupiah } from "@/lib/format";
import { dateLabel, dateOnly, PAYABLE_STATUS_LABEL } from "@/lib/stock";
import type { PayableRow } from "@/server/payable-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { TextLink } from "../mui/links";
import { PayableStatusBadge } from "./payable-status-badge";

const COLUMNS: GridColDef<PayableRow>[] = [
  {
    field: "dueDate",
    headerName: "Jatuh tempo",
    type: "dateTime",
    width: 130,
    valueGetter: (_value, row) => dateOnly(row.dueDate),
    renderCell: ({ row }) => dateLabel(row.dueDate),
  },
  {
    field: "invoiceNumber",
    headerName: "Faktur",
    flex: 1,
    minWidth: 160,
    renderCell: ({ row }) => (
      <Box>
        <TextLink href={`/admin/stok/masuk/${row.id}`} sx={{ fontWeight: 500 }}>
          {row.invoiceNumber}
        </TextLink>
        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
          {row.supplierName}
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
    field: "paid",
    headerName: "Dibayar / retur",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 140,
    valueGetter: (_value, row) => row.paid - row.refunded,
    renderCell: ({ row }) => (
      <Box>
        {formatRupiah(row.paid - row.refunded)}
        {row.returned > 0 && (
          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
            retur {formatRupiah(row.returned)}
          </Typography>
        )}
      </Box>
    ),
  },
  {
    field: "balance",
    headerName: "Sisa",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 140,
    renderCell: ({ row }) => (
      <Box component="span" sx={{ fontWeight: 500 }}>
        {row.balance < 0 ? `Kredit ${formatRupiah(-row.balance)}` : formatRupiah(row.balance)}
      </Box>
    ),
  },
  {
    field: "status",
    headerName: "Status",
    minWidth: 150,
    valueGetter: (_value, row) => PAYABLE_STATUS_LABEL[row.status],
    renderCell: ({ row }) => <PayableStatusBadge status={row.status} overdue={row.overdue} />,
  },
];

/** Daftar hutang (spec stok 6.1). */
export function PayableTable({ rows }: { rows: PayableRow[] }) {
  return <AdminDataGrid rows={rows} columns={COLUMNS} label="Daftar hutang" emptyText="Tidak ada faktur di tampilan ini." />;
}

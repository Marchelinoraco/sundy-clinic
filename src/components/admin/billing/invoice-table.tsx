"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { INVOICE_STATUS_LABEL } from "@/lib/invoice";
import type { InvoiceRow } from "@/server/invoice-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { TextLink } from "../mui/links";
import { InvoiceStatusBadge } from "./invoice-status-badge";

const COLUMNS: GridColDef<InvoiceRow>[] = [
  {
    field: "number",
    headerName: "Tagihan",
    type: "dateTime",
    minWidth: 150,
    flex: 1,
    valueGetter: (_value, row) => row.createdAt,
    renderCell: ({ row }) => (
      <Box>
        <TextLink href={`/admin/tagihan/${row.id}`} sx={{ fontWeight: 500 }}>
          {row.number ?? "Draf"}
        </TextLink>
        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
          {formatDateWithYear(row.createdAt)}
        </Typography>
      </Box>
    ),
  },
  { field: "patientName", headerName: "Pasien", flex: 1, minWidth: 140 },
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
    field: "balance",
    headerName: "Sisa",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 130,
    renderCell: ({ row }) => (
      <Box component="span" sx={{ fontWeight: 500 }}>
        {formatRupiah(row.balance)}
      </Box>
    ),
  },
  {
    field: "display",
    headerName: "Status",
    minWidth: 130,
    valueGetter: (_value, row) => INVOICE_STATUS_LABEL[row.display],
    renderCell: ({ row }) => <InvoiceStatusBadge status={row.display} />,
  },
];

/** Daftar tagihan (spec tagihan 4.1). */
export function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  return <AdminDataGrid rows={rows} columns={COLUMNS} label="Daftar tagihan" emptyText="Tidak ada tagihan di tampilan ini." />;
}

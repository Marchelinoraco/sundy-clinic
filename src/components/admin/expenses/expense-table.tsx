"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { formatRupiah } from "@/lib/format";
import { dateLabel, dateOnly } from "@/lib/stock";
import type { ExpenseRow } from "@/server/expense-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { StatusChip } from "../mui/status-chip";
import { VoidExpenseDialog } from "./void-expense-dialog";

const COLUMNS: GridColDef<ExpenseRow>[] = [
  {
    field: "date",
    headerName: "Tanggal",
    type: "dateTime",
    width: 120,
    valueGetter: (_value, row) => dateOnly(row.date),
    renderCell: ({ row }) => dateLabel(row.date),
  },
  {
    field: "categoryName",
    headerName: "Kategori",
    flex: 1,
    minWidth: 140,
    renderCell: ({ row }) => (
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <span>{row.categoryName}</span>
        {row.recurring && <StatusChip label="Berulang" />}
      </Stack>
    ),
  },
  {
    field: "note",
    headerName: "Keterangan",
    flex: 1,
    minWidth: 160,
    sortable: false,
    renderCell: ({ row }) => (
      <Box>
        <Box component="span" sx={row.voided ? { textDecoration: "line-through", color: "text.secondary" } : undefined}>
          {row.note ?? "-"}
        </Box>
        {row.voided && (
          <Box sx={{ fontSize: "0.75rem", color: "error.main" }}>
            Dibatalkan oleh {row.voided.by}: {row.voided.reason}
          </Box>
        )}
      </Box>
    ),
  },
  { field: "branchName", headerName: "Cabang", minWidth: 120, valueGetter: (_value, row) => row.branchName ?? "Umum" },
  {
    field: "amount",
    headerName: "Nominal",
    type: "number",
    align: "right",
    headerAlign: "right",
    width: 140,
    renderCell: ({ row }) => (
      <Box component="span" sx={row.voided ? { textDecoration: "line-through", color: "text.secondary" } : undefined}>
        {formatRupiah(row.amount)}
      </Box>
    ),
  },
  {
    field: "actions",
    headerName: "",
    sortable: false,
    filterable: false,
    disableColumnMenu: true,
    width: 120,
    align: "right",
    renderCell: ({ row }) => (row.voided ? null : <VoidExpenseDialog id={row.id} label={`${row.categoryName} ${formatRupiah(row.amount)}`} />),
  },
];

/** Daftar pengeluaran satu bulan; total tidak menghitung yang dibatalkan. */
export function ExpenseTable({ rows }: { rows: ExpenseRow[] }) {
  const total = rows.reduce((sum, row) => (row.voided ? sum : sum + row.amount), 0);
  return (
    <>
      <AdminDataGrid rows={rows} columns={COLUMNS} label="Daftar pengeluaran" emptyText="Belum ada pengeluaran di bulan ini." />
      {rows.length > 0 && (
        <Stack direction="row" sx={{ justifyContent: "space-between", px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
          <Typography variant="body2">Total (tanpa yang dibatalkan)</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatRupiah(total)}
          </Typography>
        </Stack>
      )}
    </>
  );
}

"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { useMemo } from "react";
import { formatRupiah } from "@/lib/format";
import type { CategoryRow, RecurringRow } from "@/server/expense-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { StatusChip } from "../mui/status-chip";
import { RecurringDialog } from "./recurring-dialog";
import { StopRecurringButton } from "./stop-recurring-button";

/** Templat pengeluaran berulang (spec laporan 7). */
export function RecurringTable({
  rows,
  categories,
  branches,
  currentMonth,
}: {
  rows: RecurringRow[];
  categories: CategoryRow[];
  branches: { id: string; name: string }[];
  currentMonth: string;
}) {
  const columns = useMemo<GridColDef<RecurringRow>[]>(
    () => [
      {
        field: "categoryName",
        headerName: "Kategori",
        flex: 1,
        minWidth: 160,
        renderCell: ({ row }) => (
          <Box>
            {row.categoryName}
            {row.note && (
              <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                {row.note}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        field: "amount",
        headerName: "Nominal",
        type: "number",
        align: "right",
        headerAlign: "right",
        width: 140,
        renderCell: ({ row }) => formatRupiah(row.amount),
      },
      {
        field: "dayOfMonth",
        headerName: "Jadwal",
        flex: 1,
        minWidth: 180,
        sortable: false,
        renderCell: ({ row }) => (
          <span>
            Tiap tanggal {row.dayOfMonth}, dari {row.startMonth}
            {row.endMonth ? ` sampai ${row.endMonth}` : ""}
          </span>
        ),
      },
      { field: "branchName", headerName: "Cabang", minWidth: 120, valueGetter: (_value, row) => row.branchName ?? "Umum" },
      {
        field: "isActive",
        headerName: "Status",
        width: 130,
        valueGetter: (_value, row) => (row.isActive ? "Aktif" : "Dihentikan"),
        renderCell: ({ row }) => <StatusChip label={row.isActive ? "Aktif" : "Dihentikan"} tone={row.isActive ? "success" : "neutral"} />,
      },
      {
        field: "actions",
        headerName: "",
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        minWidth: 180,
        align: "right",
        renderCell: ({ row }) =>
          row.isActive ? (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
              <RecurringDialog categories={categories} branches={branches} currentMonth={currentMonth} row={row} />
              <StopRecurringButton id={row.id} label={row.categoryName} />
            </Stack>
          ) : null,
      },
    ],
    [categories, branches, currentMonth],
  );
  return <AdminDataGrid rows={rows} columns={columns} label="Daftar pengeluaran berulang" emptyText="Belum ada pengeluaran berulang." />;
}

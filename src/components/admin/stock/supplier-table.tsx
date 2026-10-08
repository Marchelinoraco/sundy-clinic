"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { useMemo } from "react";
import { formatRupiah } from "@/lib/format";
import type { SupplierRow } from "@/server/stock-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { StatusChip } from "../mui/status-chip";
import { SupplierActiveButton } from "./supplier-active-button";
import { SupplierDialog } from "./supplier-dialog";

/** Tab "Supplier" (spec stok 5.6). Kolom sisa hutang hanya untuk pemegang payable:manage. */
export function SupplierTable({ rows, canManage }: { rows: SupplierRow[]; canManage: boolean }) {
  const showBalance = rows.some((row) => row.balance !== null);
  const columns = useMemo<GridColDef<SupplierRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Nama",
        flex: 1,
        minWidth: 180,
        renderCell: ({ row }) => (
          <Box>
            <Box sx={{ fontWeight: 500 }}>{row.name}</Box>
            {row.notes && (
              <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                {row.notes}
              </Typography>
            )}
          </Box>
        ),
      },
      { field: "phone", headerName: "Telepon", minWidth: 140, valueGetter: (_value, row) => row.phone ?? "—" },
      { field: "address", headerName: "Alamat", flex: 1, minWidth: 160, valueGetter: (_value, row) => row.address ?? "—" },
      ...(showBalance
        ? [
            {
              field: "balance",
              headerName: "Sisa hutang",
              type: "number",
              align: "right",
              headerAlign: "right",
              width: 140,
              renderCell: ({ row }) => formatRupiah(row.balance ?? 0),
            } satisfies GridColDef<SupplierRow>,
          ]
        : []),
      {
        field: "isActive",
        headerName: "Status",
        width: 120,
        valueGetter: (_value, row) => (row.isActive ? "Aktif" : "Nonaktif"),
        renderCell: ({ row }) => <StatusChip label={row.isActive ? "Aktif" : "Nonaktif"} tone={row.isActive ? "success" : "neutral"} />,
      },
      ...(canManage
        ? [
            {
              field: "actions",
              headerName: "Aksi",
              sortable: false,
              filterable: false,
              disableColumnMenu: true,
              minWidth: 200,
              renderCell: ({ row }) => (
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <SupplierDialog
                    supplierId={row.id}
                    triggerLabel="Ubah"
                    initial={{ name: row.name, phone: row.phone ?? "", address: row.address ?? "", notes: row.notes ?? "" }}
                  />
                  <SupplierActiveButton supplierId={row.id} name={row.name} active={row.isActive} />
                </Stack>
              ),
            } satisfies GridColDef<SupplierRow>,
          ]
        : []),
    ],
    [showBalance, canManage],
  );
  return <AdminDataGrid rows={rows} columns={columns} label="Daftar supplier" emptyText="Belum ada supplier." />;
}

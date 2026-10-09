"use client";

import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { Staff } from "@prisma/client";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import { AdminDataGrid } from "./mui/admin-data-grid";
import { StatusChip } from "./mui/status-chip";

const COLUMNS: GridColDef<Staff>[] = [
  {
    field: "name",
    headerName: "Nama",
    flex: 1,
    minWidth: 180,
    renderCell: ({ row }) => <Typography sx={{ fontWeight: 500, fontSize: "inherit" }}>{row.name}</Typography>,
  },
  {
    field: "role",
    headerName: "Peran",
    minWidth: 150,
    valueGetter: (_value, row) => STAFF_ROLE_LABEL[row.role],
    renderCell: ({ row }) => <StatusChip label={STAFF_ROLE_LABEL[row.role]} />,
  },
  { field: "showOnWebsite", headerName: "Tampil di situs", minWidth: 130, valueGetter: (_value, row) => (row.showOnWebsite ? "Ya" : "Tidak") },
  {
    field: "isActive",
    headerName: "Status",
    minWidth: 120,
    valueGetter: (_value, row) => (row.isActive ? "Aktif" : "Nonaktif"),
    renderCell: ({ row }) => <StatusChip label={row.isActive ? "Aktif" : "Nonaktif"} tone={row.isActive ? "success" : "neutral"} />,
  },
];

export function StaffTable({ staff }: { staff: Staff[] }) {
  return <AdminDataGrid rows={staff} columns={COLUMNS} label="Daftar staf" emptyText="Belum ada staf." />;
}

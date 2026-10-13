"use client";

import Box from "@mui/material/Box";
import type { GridColDef } from "@mui/x-data-grid";
import { DISPENSING_STATUS_LABEL } from "@/lib/dispensing";
import { formatDateWithYear } from "@/lib/format";
import type { DispensingRow } from "@/server/dispensing-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { TextLink } from "../mui/links";
import { DispensingStatusBadge } from "./dispensing-status-badge";

const COLUMNS: GridColDef<DispensingRow>[] = [
  {
    field: "patientName",
    headerName: "Pasien",
    flex: 1,
    minWidth: 160,
    renderCell: ({ row }) => (
      <>
        <TextLink href={`/admin/resep/${row.id}`} sx={{ fontWeight: 500 }}>
          {row.patientName}
        </TextLink>
        {row.source === "DOKTER" && (
          <Box component="span" sx={{ ml: 1, fontSize: "0.75rem", color: "text.secondary" }}>
            dari dokter
          </Box>
        )}
      </>
    ),
  },
  { field: "branchName", headerName: "Cabang", flex: 1, minWidth: 120 },
  {
    field: "startAt",
    headerName: "Kunjungan",
    type: "dateTime",
    width: 140,
    valueGetter: (_value, row) => row.startAt,
    renderCell: ({ row }) => formatDateWithYear(row.startAt),
  },
  { field: "lineCount", headerName: "Obat", type: "number", align: "right", headerAlign: "right", width: 90 },
  {
    field: "status",
    headerName: "Status",
    minWidth: 130,
    valueGetter: (_value, row) => DISPENSING_STATUS_LABEL[row.status],
    renderCell: ({ row }) => <DispensingStatusBadge status={row.status} />,
  },
];

/** Antrean resep (spec penyerahan 6). */
export function DispensingTable({ rows }: { rows: DispensingRow[] }) {
  return <AdminDataGrid rows={rows} columns={COLUMNS} label="Daftar resep" emptyText="Tidak ada resep di tampilan ini." />;
}

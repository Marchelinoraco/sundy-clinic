"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { useMemo } from "react";
import { formatDateWithYear } from "@/lib/format";
import type { BillableVisit } from "@/server/invoice-read";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { StatusChip } from "../mui/status-chip";
import { CreateInvoiceButton } from "./create-invoice-button";

const COLUMNS: GridColDef<BillableVisit>[] = [
  {
    field: "finalizedAt",
    headerName: "Selesai",
    type: "dateTime",
    width: 130,
    valueGetter: (_value, row) => row.finalizedAt,
    renderCell: ({ row }) => formatDateWithYear(row.finalizedAt),
  },
  {
    field: "patientName",
    headerName: "Pasien",
    flex: 1,
    minWidth: 160,
    renderCell: ({ row }) => (
      <Box>
        {row.patientName}
        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
          {row.medicalRecordNumber}
        </Typography>
      </Box>
    ),
  },
  {
    field: "serviceName",
    headerName: "Layanan",
    flex: 1,
    minWidth: 140,
    renderCell: ({ row }) => (
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <span>{row.serviceName ?? "-"}</span>
        {row.online && <StatusChip label="Online" />}
      </Stack>
    ),
  },
  { field: "branchName", headerName: "Cabang", flex: 1, minWidth: 120 },
  { field: "treatmentCount", headerName: "Treatment", type: "number", align: "right", headerAlign: "right", width: 110 },
];

/** Kunjungan final 30 hari terakhir yang belum punya tagihan aktif (spec tagihan 4.1). */
export function BillableTable({ rows, canManage }: { rows: BillableVisit[]; canManage: boolean }) {
  const columns = useMemo<GridColDef<BillableVisit>[]>(
    () =>
      canManage
        ? [
            ...COLUMNS,
            {
              field: "actions",
              headerName: "",
              sortable: false,
              filterable: false,
              disableColumnMenu: true,
              width: 160,
              align: "right",
              renderCell: ({ row }) => <CreateInvoiceButton appointmentId={row.appointmentId} patientName={row.patientName} />,
            },
          ]
        : COLUMNS,
    [canManage],
  );
  return (
    <AdminDataGrid
      rows={rows}
      columns={columns}
      getRowId={(row) => row.appointmentId}
      label="Kunjungan perlu ditagih"
      emptyText="Semua kunjungan sudah ditagih."
    />
  );
}

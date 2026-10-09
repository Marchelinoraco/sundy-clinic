"use client";

import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { formatDateWithYear, formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { PatientSummary } from "@/server/patient";
import { AdminDataGrid } from "./mui/admin-data-grid";
import { TextLink } from "./mui/links";
import { StatusChip } from "./mui/status-chip";

export type PatientTableRow = PatientSummary & { programLabel: string };

const COLUMNS: GridColDef<PatientTableRow>[] = [
  {
    field: "medicalRecordNumber",
    headerName: "No. RM",
    width: 150,
    renderCell: ({ row }) => (
      <Typography component="span" sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>
        {row.medicalRecordNumber}
      </Typography>
    ),
  },
  {
    field: "name",
    headerName: "Nama",
    flex: 1,
    minWidth: 180,
    renderCell: ({ row }) => <TextLink href={`/admin/pasien/${row.id}`}>{row.name}</TextLink>,
  },
  { field: "whatsapp", headerName: "WhatsApp", minWidth: 150 },
  {
    field: "programStatus",
    headerName: "Program",
    minWidth: 130,
    valueGetter: (_value, row) => row.programLabel,
    renderCell: ({ row }) => <StatusChip label={row.programLabel} tone={row.programStatus === "AKTIF" ? "primary" : "neutral"} />,
  },
  {
    field: "lastVisitAt",
    headerName: "Kunjungan terakhir",
    type: "dateTime",
    minWidth: 160,
    valueGetter: (_value, row) => row.lastVisitAt,
    renderCell: ({ row }) => (row.lastVisitAt ? formatDateWithYear(row.lastVisitAt) : "—"),
  },
  {
    field: "nextBookingAt",
    headerName: "Booking berikutnya",
    type: "dateTime",
    minWidth: 170,
    valueGetter: (_value, row) => row.nextBookingAt,
    renderCell: ({ row }) =>
      row.nextBookingAt ? `${formatShortIndonesianDate(row.nextBookingAt)} · ${minutesToTimeLabel(witaMinutesOfDay(row.nextBookingAt))}` : "—",
  },
];

/** Daftar pasien (spec MUI 4): urut kolom dan halaman 25 baris di atas hasil cari dari server. */
export function PatientTable({ patients, emptyText }: { patients: PatientTableRow[]; emptyText: string }) {
  return <AdminDataGrid rows={patients} columns={COLUMNS} label="Daftar pasien" emptyText={emptyText} />;
}

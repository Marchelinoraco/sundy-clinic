"use client";

import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { useTransition } from "react";
import { toast } from "sonner";
import type { Holiday } from "@prisma/client";
import { formatIndonesianDate } from "@/lib/format";
import { deleteHoliday } from "@/server/holiday";
import { EmptyState } from "./page-layout";

const KIND_LABEL: Record<Holiday["kind"], string> = {
  LIBUR_NASIONAL: "Libur Nasional",
  CUTI_BERSAMA: "Cuti Bersama",
  LIBUR_KLINIK: "Libur Klinik",
};

export function HolidayList({
  holidays,
  emptyText = "Belum ada hari libur tercatat tahun ini.",
}: {
  holidays: Holiday[];
  emptyText?: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        const result = await deleteHoliday(id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Hari libur dihapus.");
      } catch {
        toast.error("Gagal menghapus hari libur. Coba lagi.");
      }
    });
  }

  if (holidays.length === 0) {
    return <EmptyState>{emptyText}</EmptyState>;
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tanggal</TableCell>
            <TableCell>Nama</TableCell>
            <TableCell>Jenis</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {holidays.map((h) => (
            <TableRow key={h.id}>
              <TableCell>{formatIndonesianDate(h.date)}</TableCell>
              <TableCell>{h.name}</TableCell>
              <TableCell>{KIND_LABEL[h.kind]}</TableCell>
              <TableCell align="right">
                <Button variant="text" size="small" disabled={pending} onClick={() => handleDelete(h.id)}>
                  Hapus
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

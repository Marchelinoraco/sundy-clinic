"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { Holiday } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIndonesianDate } from "@/lib/format";
import { deleteHoliday } from "@/server/holiday";

const KIND_LABEL: Record<Holiday["kind"], string> = {
  LIBUR_NASIONAL: "Libur Nasional",
  CUTI_BERSAMA: "Cuti Bersama",
  LIBUR_KLINIK: "Libur Klinik",
};

export function HolidayList({ holidays }: { holidays: Holiday[] }) {
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteHoliday(id);
        toast.success("Hari libur dihapus.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal menghapus.");
      }
    });
  }

  if (holidays.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada hari libur tercatat tahun ini.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Nama</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {holidays.map((h) => (
          <TableRow key={h.id}>
            <TableCell>{formatIndonesianDate(h.date)}</TableCell>
            <TableCell>{h.name}</TableCell>
            <TableCell>{KIND_LABEL[h.kind]}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => handleDelete(h.id)}>
                Hapus
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

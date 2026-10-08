"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteScheduleException } from "@/server/schedule";
import { EmptyState } from "./page-layout";

export type ExceptionRow = { id: string; dateLabel: string; kindLabel: string; timeLabel: string | null };

/** Pengecualian mulai hari ini, dengan Hapus yang meminta konfirmasi (spec D 5.1). */
export function ScheduleExceptionList({ exceptions }: { exceptions: ExceptionRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<ExceptionRow | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(row: ExceptionRow) {
    setTarget(null);
    startTransition(async () => {
      try {
        const result = await deleteScheduleException(row.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Pengecualian dihapus.");
        router.refresh();
      } catch {
        toast.error("Gagal menghapus pengecualian. Coba lagi.");
      }
    });
  }

  if (exceptions.length === 0) return <EmptyState>Belum ada pengecualian mulai hari ini.</EmptyState>;

  return (
    <>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tanggal</TableCell>
              <TableCell>Jenis</TableCell>
              <TableCell>Jam</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {exceptions.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.dateLabel}</TableCell>
                <TableCell>{row.kindLabel}</TableCell>
                <TableCell>{row.timeLabel ?? "Sehari penuh"}</TableCell>
                <TableCell align="right">
                  <Button variant="text" size="small" disabled={pending} onClick={() => setTarget(row)}>
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={target !== null} onClose={() => setTarget(null)} maxWidth="xs" slotProps={{ paper: { role: "alertdialog" } }}>
        <DialogTitle>Hapus pengecualian {target?.dateLabel}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {target?.kindLabel}
            {target?.timeLabel ? ` ${target.timeLabel}` : ""}. Booking yang sudah ada tidak berubah.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)}>Kembali</Button>
          <Button variant="contained" onClick={() => target && remove(target)}>
            Hapus pengecualian
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

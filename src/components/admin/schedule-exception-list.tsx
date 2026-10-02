"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal</TableHead>
            <TableHead>Jenis</TableHead>
            <TableHead>Jam</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {exceptions.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.dateLabel}</TableCell>
              <TableCell>{row.kindLabel}</TableCell>
              <TableCell>{row.timeLabel ?? "Sehari penuh"}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setTarget(row)}>
                  Hapus
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <AlertDialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengecualian {target?.dateLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.kindLabel}
              {target?.timeLabel ? ` ${target.timeLabel}` : ""}. Booking yang sudah ada tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={() => target && remove(target)}>Hapus pengecualian</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

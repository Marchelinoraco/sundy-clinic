"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rowsChanged, toDayInputs, WEEKDAY_LABELS, weekRows, type WeekRow } from "@/lib/schedule-week";
import { saveWeeklySchedule } from "@/server/schedule";
import { SectionCard } from "./page-layout";

type Props = {
  staffId: string;
  branchId: string;
  branchName: string;
  templates: { weekday: number; startMinute: number; endMinute: number }[];
};

/** Jam kerja Senin–Minggu dengan satu tombol Simpan (spec D 5.1). */
export function WeeklyScheduleForm({ staffId, branchId, branchName, templates }: Props) {
  const router = useRouter();
  const saved = useMemo(() => weekRows(templates), [templates]);
  const [rows, setRows] = useState<WeekRow[]>(saved);
  const [pending, startTransition] = useTransition();
  const dirty = rowsChanged(rows, saved);

  function update(weekday: number, patch: Partial<WeekRow>) {
    setRows((current) => current.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)));
  }

  function save() {
    const days = toDayInputs(rows);
    if (days.some((day) => day.open && (day.startMinute === null || day.endMinute === null))) {
      toast.error("Isi jam mulai dan selesai untuk setiap hari yang buka.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveWeeklySchedule({ staffId, branchId, days });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Jam kerja tersimpan.");
        router.refresh();
      } catch {
        toast.error("Gagal menyimpan jam kerja. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard
      title={`Jam kerja mingguan · ${branchName}`}
      flush
      actions={
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? "Menyimpan…" : "Simpan jam kerja"}
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Hari</TableHead>
            <TableHead>Buka</TableHead>
            <TableHead>Mulai</TableHead>
            <TableHead>Selesai</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const label = WEEKDAY_LABELS[row.weekday];
            return (
              <TableRow key={row.weekday}>
                <TableCell className="font-medium">{label}</TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    className="size-4 accent-gold-500"
                    aria-label={`Buka hari ${label}`}
                    checked={row.open}
                    onChange={(e) => update(row.weekday, { open: e.target.checked })}
                  />
                </TableCell>
                <TableCell>
                  {row.open ? (
                    <Input
                      type="time"
                      aria-label={`Mulai ${label}`}
                      className="w-32"
                      value={row.start}
                      onChange={(e) => update(row.weekday, { start: e.target.value })}
                    />
                  ) : (
                    <span className="text-muted-foreground">Tutup</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.open ? (
                    <Input
                      type="time"
                      aria-label={`Selesai ${label}`}
                      className="w-32"
                      value={row.end}
                      onChange={(e) => update(row.weekday, { end: e.target.value })}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

"use client";

import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
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
        <Button size="small" variant="contained" onClick={save} disabled={!dirty || pending}>
          {pending ? "Menyimpan…" : "Simpan jam kerja"}
        </Button>
      }
    >
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Hari</TableCell>
              <TableCell>Buka</TableCell>
              <TableCell>Mulai</TableCell>
              <TableCell>Selesai</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const label = WEEKDAY_LABELS[row.weekday];
              return (
                <TableRow key={row.weekday}>
                  <TableCell sx={{ fontWeight: 500 }}>{label}</TableCell>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={row.open}
                      onChange={(e) => update(row.weekday, { open: e.target.checked })}
                      slotProps={{ input: { "aria-label": `Buka hari ${label}` } }}
                    />
                  </TableCell>
                  <TableCell>
                    {row.open ? (
                      <TextField
                        type="time"
                        value={row.start}
                        onChange={(e) => update(row.weekday, { start: e.target.value })}
                        slotProps={{ htmlInput: { "aria-label": `Mulai ${label}` } }}
                        sx={{ width: 140 }}
                      />
                    ) : (
                      <Typography variant="body2" component="span" sx={{ color: "text.secondary" }}>
                        Tutup
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.open ? (
                      <TextField
                        type="time"
                        value={row.end}
                        onChange={(e) => update(row.weekday, { end: e.target.value })}
                        slotProps={{ htmlInput: { "aria-label": `Selesai ${label}` } }}
                        sx={{ width: 140 }}
                      />
                    ) : (
                      <Typography variant="body2" component="span" sx={{ color: "text.secondary" }}>
                        —
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </SectionCard>
  );
}

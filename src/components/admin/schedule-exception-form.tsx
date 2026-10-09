"use client";

import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ExceptionKind } from "@prisma/client";
import { timeInputToMinutes } from "@/lib/time";
import { createScheduleException } from "@/server/schedule";
import { DateField } from "./mui/date-field";
import { SelectField } from "./mui/select-field";

export function ScheduleExceptionForm({ staffId }: { staffId: string }) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<ExceptionKind>("LIBUR");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pending, startTransition] = useTransition();

  const needsTime = kind !== "LIBUR";

  function handleSubmit() {
    if (!date) {
      toast.error("Tanggal wajib diisi.");
      return;
    }

    const startMinute = needsTime ? timeInputToMinutes(start) : null;
    const endMinute = needsTime ? timeInputToMinutes(end) : null;
    if (needsTime && (startMinute === null || endMinute === null)) {
      toast.error("Jam mulai dan selesai wajib diisi.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createScheduleException({
          staffId,
          branchId: null,
          date,
          kind,
          startMinute,
          endMinute,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Pengecualian tersimpan.");
        setDate("");
        setStart("");
        setEnd("");
      } catch {
        toast.error("Gagal menyimpan pengecualian. Coba lagi.");
      }
    });
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
      <DateField id="exception-date" label="Tanggal" value={date} onChange={setDate} sx={{ width: 180 }} />
      <SelectField id="exception-kind" label="Jenis" value={kind} onChange={(value) => setKind(value as ExceptionKind)} fullWidth={false} sx={{ width: 240 }}>
        <option value="LIBUR">Cuti (libur sehari penuh)</option>
        <option value="JAM_TAMBAHAN">Jam tambahan</option>
        <option value="BLOKIR_SEBAGIAN">Blokir sebagian jam</option>
      </SelectField>
      {needsTime && (
        <>
          <TextField
            id="exception-start"
            label="Mulai"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 130 }}
          />
          <TextField
            id="exception-end"
            label="Selesai"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 130 }}
          />
        </>
      )}
      <Button size="small" variant="contained" disabled={pending} onClick={handleSubmit} sx={{ height: 40 }}>
        {pending ? "Menyimpan…" : "Tambah"}
      </Button>
    </Paper>
  );
}

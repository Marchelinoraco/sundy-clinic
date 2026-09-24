"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ExceptionKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { timeInputToMinutes } from "@/lib/time";
import { createScheduleException } from "@/server/schedule";

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
        await createScheduleException({
          staffId,
          branchId: null,
          date,
          kind,
          startMinute,
          endMinute,
        });
        toast.success("Pengecualian tersimpan.");
        setDate("");
        setStart("");
        setEnd("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal menyimpan.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="space-y-1">
        <Label htmlFor="exception-date" className="text-xs">
          Tanggal
        </Label>
        <Input
          id="exception-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Jenis</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as ExceptionKind)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LIBUR">Cuti (libur sehari penuh)</SelectItem>
            <SelectItem value="JAM_TAMBAHAN">Jam tambahan</SelectItem>
            <SelectItem value="BLOKIR_SEBAGIAN">Blokir sebagian jam</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {needsTime && (
        <>
          <div className="space-y-1">
            <Label htmlFor="exception-start" className="text-xs">
              Mulai
            </Label>
            <Input
              id="exception-start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-28"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exception-end" className="text-xs">
              Selesai
            </Label>
            <Input
              id="exception-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-28"
            />
          </div>
        </>
      )}
      <Button size="sm" disabled={pending} onClick={handleSubmit}>
        {pending ? "Menyimpan…" : "Tambah"}
      </Button>
    </div>
  );
}

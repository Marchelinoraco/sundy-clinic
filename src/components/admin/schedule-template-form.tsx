"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ScheduleTemplate } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { minutesToTimeInput, timeInputToMinutes } from "@/lib/time";
import { upsertScheduleTemplate } from "@/server/schedule";

const WEEKDAY_LABEL =["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type Props = {
  staffId: string;
  branchId: string;
  weekday: number;
  existing?: ScheduleTemplate;
};

export function ScheduleTemplateForm({ staffId, branchId, weekday, existing }: Props) {
  const [start, setStart] = useState(existing ? minutesToTimeInput(existing.startMinute) : "11:00");
  const [end, setEnd] = useState(existing ? minutesToTimeInput(existing.endMinute) : "19:00");
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const startMinute = timeInputToMinutes(start);
    const endMinute = timeInputToMinutes(end);
    if (startMinute === null || endMinute === null) {
      toast.error("Jam mulai dan selesai wajib diisi.");
      return;
    }

    startTransition(async () => {
      try {
        await upsertScheduleTemplate({
          staffId,
          branchId,
          weekday,
          startMinute,
          endMinute,
          slotMinutes: 30,
        });
        toast.success(`Jadwal ${WEEKDAY_LABEL[weekday]} tersimpan.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal menyimpan jadwal.");
      }
    });
  }

  const inputId = `template-${weekday}`;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <span className="w-20 pb-2 text-sm font-medium">{WEEKDAY_LABEL[weekday]}</span>
      <div className="space-y-1">
        <Label htmlFor={`${inputId}-start`} className="text-xs">
          Mulai
        </Label>
        <Input
          id={`${inputId}-start`}
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-28"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${inputId}-end`} className="text-xs">
          Selesai
        </Label>
        <Input
          id={`${inputId}-end`}
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-28"
        />
      </div>
      <Button size="sm" disabled={pending} onClick={handleSave}>
        {pending ? "Menyimpan…" : existing ? "Simpan" : "Aktifkan"}
      </Button>
      {!existing && <span className="pb-2 text-xs text-muted-foreground">Belum dijadwalkan</span>}
    </div>
  );
}

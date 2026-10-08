"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import { combineWitaDateAndMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { DayAvailability } from "@/server/availability";
import { getStaffAvailabilityRange } from "@/server/schedule";

export const STRIP_DAYS = 14;

type Props = {
  staffId: string;
  branchId: string;
  durationMinutes: number;
  /** Hari ini dalam WITA, dari server. */
  today: string;
  /** Tanggal terpilih ("YYYY-MM-DD"), atau "" bila belum ada. */
  selected: string;
  onSelect: (date: string) => void;
  /** Dinaikkan oleh form untuk memaksa muat ulang, misal setelah jam direbut booking lain. */
  refreshKey: number;
  /** Pindah jadwal: jam milik booking ini tidak dihitung terisi. */
  excludeAppointmentId?: string;
};

type LoadState = { key: string; days: DayAvailability[]; failed: boolean };

function stateLabel(day: DayAvailability): string {
  if (day.state === "CLOSED") return "tutup";
  if (day.state === "FULL") return "penuh";
  return `${day.openCount} jam`;
}

/** Tengah hari WITA, agar label tanggal tidak bergeser ke hari lain. */
function noon(date: string): Date {
  return combineWitaDateAndMinutes(date, 12 * 60);
}

/** Strip 14 hari mulai hari ini, dan isian untuk tanggal di luarnya (spec C1 bagian 3). */
export function DateStrip({
  staffId,
  branchId,
  durationMinutes,
  today,
  selected,
  onSelect,
  refreshKey,
  excludeAppointmentId,
}: Props) {
  const requestKey = `${staffId}|${branchId}|${durationMinutes}|${today}|${refreshKey}|${excludeAppointmentId ?? ""}`;
  const [loaded, setLoaded] = useState<LoadState>({ key: "", days: [], failed: false });
  const [showOtherDate, setShowOtherDate] = useState(false);
  const latestKey = useRef(requestKey);

  useEffect(() => {
    latestKey.current = requestKey;
    getStaffAvailabilityRange({
      staffId,
      branchId,
      durationMinutes,
      from: today,
      days: STRIP_DAYS,
      ...(excludeAppointmentId ? { excludeAppointmentId } : {}),
    })
      .then((days) => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, days, failed: false });
      })
      .catch(() => {
        if (latestKey.current === requestKey) setLoaded({ key: requestKey, days: [], failed: true });
      });
  }, [requestKey, staffId, branchId, durationMinutes, today, excludeAppointmentId]);

  const ready = loaded.key === requestKey;
  const inStrip = loaded.days.some((day) => day.date === selected);

  return (
    <div className="space-y-3">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Memuat tanggal…</p>
      ) : loaded.failed ? (
        <p className="text-sm text-destructive">Gagal memuat tanggal. Gunakan Pilih tanggal lain.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih tanggal">
            {loaded.days.map((day) => {
              const open = day.state === "OPEN";
              const isSelected = day.date === selected;
              return (
                <button
                  key={day.date}
                  type="button"
                  data-date={day.date}
                  disabled={!open}
                  aria-pressed={isSelected}
                  aria-label={`${formatIndonesianDate(noon(day.date))} — ${open ? `${day.openCount} jam kosong` : stateLabel(day)}`}
                  onClick={() => onSelect(day.date)}
                  className={cn(
                    "flex w-[4.75rem] flex-col items-center rounded-lg border px-1 py-2 text-xs transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : open
                        ? "bg-background hover:bg-accent"
                        : "cursor-not-allowed bg-muted text-muted-foreground",
                  )}
                >
                  <span>{formatShortIndonesianDate(noon(day.date))}</span>
                  <span className="mt-1 font-medium">{stateLabel(day)}</span>
                </button>
              );
            })}
          </div>
          {loaded.days.every((day) => day.state === "CLOSED") && (
            <p className="text-sm text-muted-foreground">
              Tidak ada jadwal dalam {STRIP_DAYS} hari ke depan — gunakan Pilih tanggal lain.
            </p>
          )}
        </>
      )}

      {showOtherDate ? (
        <div className="space-y-1">
          <Label htmlFor="booking-date-other">Tanggal lain</Label>
          <Input
            id="booking-date-other"
            type="date"
            min={today}
            value={inStrip ? "" : selected}
            onChange={(e) => onSelect(e.target.value)}
            className="w-44"
          />
        </div>
      ) : (
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => setShowOtherDate(true)}>
          Pilih tanggal lain
        </Button>
      )}
    </div>
  );
}

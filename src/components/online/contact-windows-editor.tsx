"use client";

import { Button } from "@/components/ui/button";
import {
  EMPTY_WINDOW_DRAFT,
  ONLINE_FIRST_MINUTE,
  ONLINE_LAST_MINUTE,
  ONLINE_MAX_WINDOWS,
  ONLINE_MIN_WINDOW_MINUTES,
  ONLINE_STEP_MINUTES,
  type WindowDraft,
} from "@/lib/online-consultation";
import { minutesToTimeLabel } from "@/lib/time";

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function minutesBetween(from: number, to: number): number[] {
  const list: number[] = [];
  for (let minute = from; minute <= to; minute += ONLINE_STEP_MINUTES) list.push(minute);
  return list;
}

const START_CHOICES = minutesBetween(ONLINE_FIRST_MINUTE, ONLINE_LAST_MINUTE - ONLINE_MIN_WINDOW_MINUTES);
const END_CHOICES = minutesBetween(ONLINE_FIRST_MINUTE + ONLINE_MIN_WINDOW_MINUTES, ONLINE_LAST_MINUTE);

/**
 * 1–3 rentang waktu luang (spec konsultasi online 3.2). Aturan lengkapnya diperiksa
 * windowDraftsError dan ulang di server; di sini hanya pilihan jam yang sah ditawarkan.
 */
export function ContactWindowsEditor({
  value,
  onChange,
  minDate,
  maxDate,
}: {
  value: WindowDraft[];
  onChange: (next: WindowDraft[]) => void;
  /** Tanggal WITA "YYYY-MM-DD". */
  minDate: string;
  maxDate: string;
}) {
  const update = (index: number, patch: Partial<WindowDraft>) =>
    onChange(value.map((window, i) => (i === index ? { ...window, ...patch } : window)));

  return (
    <div className="space-y-3">
      {value.map((window, index) => {
        const n = index + 1;
        return (
          <fieldset key={index} className="grid gap-3 rounded-xl border border-cream-300 bg-white p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">Waktu {n}</legend>
            <label className="space-y-1 text-sm">
              <span>Tanggal</span>
              <input
                type="date"
                aria-label={`Tanggal waktu ${n}`}
                min={minDate}
                max={maxDate}
                value={window.date}
                onChange={(e) => update(index, { date: e.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Mulai</span>
              <select
                aria-label={`Jam mulai waktu ${n}`}
                value={window.startMinute}
                onChange={(e) => update(index, { startMinute: Number(e.target.value) })}
                className={fieldClass}
              >
                {START_CHOICES.map((minute) => (
                  <option key={minute} value={minute}>
                    {minutesToTimeLabel(minute)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Selesai</span>
              <select
                aria-label={`Jam selesai waktu ${n}`}
                value={window.endMinute}
                onChange={(e) => update(index, { endMinute: Number(e.target.value) })}
                className={fieldClass}
              >
                {END_CHOICES.map((minute) => (
                  <option key={minute} value={minute}>
                    {minutesToTimeLabel(minute)}
                  </option>
                ))}
              </select>
            </label>
            {value.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-start sm:col-span-3"
                aria-label={`Hapus waktu ${n}`}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                Hapus
              </Button>
            )}
          </fieldset>
        );
      })}
      {value.length < ONLINE_MAX_WINDOWS && (
        <Button type="button" variant="outline" onClick={() => onChange([...value, EMPTY_WINDOW_DRAFT])}>
          + Tambah waktu
        </Button>
      )}
    </div>
  );
}

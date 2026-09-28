"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActivityEntry } from "@/lib/kuis/v1/answers";
import { ACTIVITY_FIRST_HOUR, ACTIVITY_KINDS, ACTIVITY_LAST_HOUR, TEXT_LIMITS } from "@/lib/kuis/v1/options";
import { minutesToTimeLabel } from "@/lib/time";
import { Segmented, optionsOf } from "./choice";

const HOURS = Array.from(
  { length: ACTIVITY_LAST_HOUR - ACTIVITY_FIRST_HOUR + 1 },
  (_, index) => ACTIVITY_FIRST_HOUR + index,
);

/**
 * P3 (K7): pasien hanya menambah yang benar-benar terjadi kemarin. Dokter
 * melihatnya sebagai tabel 06.00–22.00 (describe.ts → activityTable).
 */
export function ActivityList({
  entries,
  onChange,
}: {
  entries: ActivityEntry[];
  onChange: (entries: ActivityEntry[]) => void;
}) {
  const [hour, setHour] = useState(7);
  const [kind, setKind] = useState<ActivityEntry["kind"]>("MAKAN_MINUM");
  const [text, setText] = useState("");
  const hourId = useId();
  const textId = useId();

  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.hour - b.entry.hour);

  function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange([...entries, { hour, kind, text: trimmed.slice(0, TEXT_LIMITS.activity) }]);
    setText("");
  }

  return (
    <div className="space-y-4">
      {sorted.length > 0 && (
        <ul aria-label="Catatan aktivitas" className="space-y-2">
          {sorted.map(({ entry, index }) => (
            <li
              key={index}
              className="flex items-center gap-3 rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm"
            >
              <span className="w-12 font-semibold">{minutesToTimeLabel(entry.hour * 60)}</span>
              <span className="text-brown-600">{ACTIVITY_KINDS[entry.kind]}</span>
              <span className="flex-1">{entry.text}</span>
              <button
                type="button"
                aria-label={`Hapus ${entry.text}`}
                onClick={() => onChange(entries.filter((_, i) => i !== index))}
                className="text-brown-500 hover:text-brown-900"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-2xl border border-dashed border-gold-500 p-3">
        <div className="flex items-center gap-2">
          <Label htmlFor={hourId}>Jam</Label>
          <select
            id={hourId}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="rounded-lg border border-cream-300 bg-white px-2 py-1"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {minutesToTimeLabel(h * 60)}
              </option>
            ))}
          </select>
        </div>
        <Segmented label="Jenis catatan" options={optionsOf(ACTIVITY_KINDS)} value={kind} onChange={setKind} />
        <div className="space-y-1">
          <Label htmlFor={textId}>Isi catatan</Label>
          <Input
            id={textId}
            placeholder="mis. Nasi ½, ikan bakar"
            maxLength={TEXT_LIMITS.activity}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={!text.trim()}>
          ＋ Tambah catatan
        </Button>
      </div>
    </div>
  );
}

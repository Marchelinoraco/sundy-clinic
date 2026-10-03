"use client";

import { useState } from "react";
import { foodRecallRows, type FoodRecallEntry } from "@/lib/food-recall";

/** Tabel 06.00–22.00 (spec check-in 5.1); jam kosong disembunyikan sampai diminta. */
export function FoodRecallTable({ entries, label }: { entries: readonly FoodRecallEntry[]; label: string }) {
  const [showAll, setShowAll] = useState(false);
  const rows = foodRecallRows(entries).filter((row) => showAll || row.entries.length > 0);
  return (
    <div className="space-y-2">
      <table aria-label={label} className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="w-16 py-1">Jam</th>
            <th className="py-1">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.hour} className="border-b align-top">
              <td className="py-1 tabular-nums text-muted-foreground">{row.label}</td>
              <td className="py-1">
                {row.entries.map((entry, index) => (
                  <span key={index} className="mr-2 inline-block">
                    <span className="text-muted-foreground">{entry.kindLabel}:</span> {entry.text}
                    {entry.byDoctor && (
                      <span className="ml-1 rounded bg-sky-50 px-1 text-xs text-sky-800">dilengkapi dokter</span>
                    )}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-4"
        onClick={() => setShowAll((value) => !value)}
      >
        {showAll ? "Sembunyikan jam kosong" : "Tampilkan 06.00–22.00"}
      </button>
    </div>
  );
}

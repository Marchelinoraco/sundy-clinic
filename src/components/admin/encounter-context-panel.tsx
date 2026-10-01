"use client";

import { useId, useState } from "react";
import { initialContextTab, type ContextTab, type VitalKey } from "@/lib/encounter";
import { cn } from "@/lib/utils";
import type { EncounterDetail } from "@/server/encounter-read";
import { EncounterIntakeTab } from "./encounter-intake-tab";
import { EncounterWarningsBox } from "./encounter-warnings";
import { PreviousVisitsTab } from "./previous-visits-tab";
import { VitalsTrendTab } from "./vitals-trend-tab";

const TABS: { key: ContextTab; label: string }[] = [
  { key: "intake", label: "Isian kuis" },
  { key: "previous", label: "Sebelumnya" },
  { key: "trend", label: "Tren" },
];

/**
 * Kolom kiri halaman kunjungan (spec UI B bagian 4): peringatan selalu di atas,
 * lalu tab Isian kuis / Sebelumnya / Tren. Di layar sempit tab bisa dilipat.
 */
export function EncounterContextPanel({
  encounter,
  currentVitals,
}: {
  encounter: EncounterDetail;
  /** Angka vital formulir saat ini, untuk baris "Kunjungan ini" di Tren. */
  currentVitals: Record<VitalKey, number | null>;
}) {
  const id = useId();
  const [tab, setTab] = useState<ContextTab>(() =>
    initialContextTab({ hasIntake: encounter.intake !== null, hasHistory: encounter.history.length > 0 }),
  );
  const trendSource = encounter.history.map((visit) => ({ date: visit.startAt, vitals: visit.vitals }));

  return (
    <div className="space-y-4">
      <EncounterWarningsBox warnings={encounter.warnings} />
      <details open className="group space-y-3">
        <summary className="cursor-pointer text-sm font-medium lg:hidden">Isian, kunjungan sebelumnya, dan tren</summary>
        <div role="tablist" aria-label="Konteks kunjungan" className="flex flex-wrap gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`${id}-${item.key}`}
              aria-selected={tab === item.key}
              aria-controls={`${id}-${item.key}-panel`}
              onClick={() => setTab(item.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                tab === item.key ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {/* Ketiga panel tetap terpasang dan yang tidak aktif disembunyikan: berpindah tab
            tidak boleh membuang suntingan di kotak persetujuan atau tabel yang sudah dibuka. */}
        {TABS.map((item) => (
          <div
            key={item.key}
            role="tabpanel"
            id={`${id}-${item.key}-panel`}
            aria-labelledby={`${id}-${item.key}`}
            hidden={tab !== item.key}
            className="rounded-lg border bg-background p-4"
          >
            {item.key === "intake" && <EncounterIntakeTab intake={encounter.intake} approval={encounter.approval} />}
            {item.key === "previous" && (
              <PreviousVisitsTab history={encounter.history} hasMore={encounter.hasMoreHistory} patientId={encounter.patient.id} />
            )}
            {item.key === "trend" && <VitalsTrendTab current={currentVitals} history={trendSource} />}
          </div>
        ))}
      </details>
    </div>
  );
}

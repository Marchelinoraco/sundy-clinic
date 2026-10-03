"use client";

import { useRef, useState } from "react";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { EncounterDetail } from "@/server/encounter-read";
import { AddendumForm } from "./addendum-form";
import { AuditTrail } from "./audit-trail";
import { EncounterContextPanel } from "./encounter-context-panel";
import type { SubjectiveCopy } from "./encounter-food-recall-tab";
import { EncounterForm, type SubjectiveHandle } from "./encounter-form";
import { EncounterRecord } from "./encounter-record";

/**
 * Ruang kerja kunjungan (spec UI B bagian 3): konteks di kiri yang tetap di
 * tempat, catatan di kanan dengan bar aksi yang menempel. Angka vital formulir
 * dipegang di sini agar tab Tren ikut berubah saat dokter mengetik.
 *
 * Jangan diberi key berdasarkan versi: router.refresh() (mis. setelah
 * persetujuan isian) tidak boleh me-remount formulir yang sedang diketik.
 */
export function EncounterWorkspace({ encounter, canWrite }: { encounter: EncounterDetail; canWrite: boolean }) {
  const [currentVitals, setCurrentVitals] = useState(encounter.vitals);
  const isFinal = encounter.status === "FINAL";
  const editable = !isFinal && canWrite;
  const weightHistory = encounter.history.map((visit) => ({ date: visit.startAt, vitals: visit.vitals }));
  const subjectiveRef = useRef<SubjectiveHandle>(null);
  const copyToSubjective: SubjectiveCopy | undefined = editable
    ? {
        has: (text) => subjectiveRef.current?.text().includes(text) ?? false,
        append: (block) => subjectiveRef.current?.append(block) ?? false,
      }
    : undefined;

  return (
    <div className="gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <aside
        aria-label="Konteks kunjungan"
        className="mb-6 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto lg:pr-1"
      >
        <EncounterContextPanel
          encounter={encounter}
          currentVitals={editable ? currentVitals : encounter.vitals}
          canEditFoodRecall={editable}
          copyToSubjective={copyToSubjective}
        />
      </aside>

      <div className="min-w-0 space-y-6">
        {editable ? (
          <EncounterForm
            encounterId={encounter.id}
            initialVersion={encounter.version}
            initialDraft={encounter.draft}
            options={encounter.options}
            weightHistory={weightHistory}
            onVitalsChange={setCurrentVitals}
            subjectiveRef={subjectiveRef}
          />
        ) : (
          <EncounterRecord encounter={encounter} />
        )}

        {isFinal && (
          <section aria-labelledby="adendum" className="space-y-3">
            <h2 id="adendum" className="text-base font-medium">
              Adendum
            </h2>
            {encounter.addenda.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada adendum.</p>
            ) : (
              <ol className="space-y-2">
                {encounter.addenda.map((addendum) => (
                  <li key={addendum.id} className="rounded-md border p-3 text-sm">
                    <p className="whitespace-pre-line">{addendum.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {addendum.authorName} · {formatIndonesianDate(addendum.createdAt)},{" "}
                      {minutesToTimeLabel(witaMinutesOfDay(addendum.createdAt))} WITA
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {canWrite && <AddendumForm encounterId={encounter.id} />}
          </section>
        )}

        {encounter.trail && <AuditTrail rows={encounter.trail} />}

        {isFinal && encounter.finalized && (
          <div className="sticky bottom-0 z-10 border-t bg-background/95 py-3 text-sm text-muted-foreground backdrop-blur">
            Final · difinalisasi oleh {encounter.finalized.byName}, {formatIndonesianDate(encounter.finalized.at)}{" "}
            {minutesToTimeLabel(witaMinutesOfDay(encounter.finalized.at))} WITA
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import type { EncounterHistoryItem } from "@/server/encounter-read";

function Part({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line">{text || "—"}</p>
    </div>
  );
}

function VisitDetail({ visit }: { visit: EncounterHistoryItem }) {
  return (
    <article aria-label={`Kunjungan ${formatIndonesianDate(visit.startAt)}`} className="space-y-2 rounded-md border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{formatIndonesianDate(visit.startAt)}</span>
        <span className="text-xs text-muted-foreground">
          {visit.branchName} · {visit.authorName}
        </span>
      </div>
      <Part label="S" text={visit.subjective} />
      {visit.vitalLines.length > 0 && <Part label="O" text={visit.vitalLines.join(" · ")} />}
      {visit.physicalExam && <Part label="Pemeriksaan fisik" text={visit.physicalExam} />}
      <Part label="A" text={visit.assessment} />
      <Part label="P" text={visit.plan} />
      {visit.treatments.length > 0 && (
        <Part
          label="Treatment"
          text={visit.treatments
            .map((row) => [row.serviceName, row.area, row.dose, row.performerName].filter(Boolean).join(" · "))
            .join("\n")}
        />
      )}
      {visit.addenda.map((addendum) => (
        <p key={addendum.id} className="rounded bg-muted p-2 text-xs">
          <span className="text-muted-foreground">
            Adendum {formatShortIndonesianDate(addendum.createdAt)} · {addendum.authorName}:
          </span>{" "}
          {addendum.text}
        </p>
      ))}
    </article>
  );
}

/** Tab Sebelumnya (spec UI B bagian 4): kunjungan terbaru terbuka, sisanya satu per satu. */
export function PreviousVisitsTab({ history, hasMore, patientId }: { history: EncounterHistoryItem[]; hasMore: boolean; patientId: string }) {
  const [openId, setOpenId] = useState<string | null>(history[0]?.id ?? null);
  if (history.length === 0) return <p className="text-sm text-muted-foreground">Belum ada kunjungan sebelumnya.</p>;

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {history.map((visit) => (
          <li key={visit.id}>
            {visit.id === openId ? (
              <VisitDetail visit={visit} />
            ) : (
              <button
                type="button"
                onClick={() => setOpenId(visit.id)}
                className="flex w-full gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="w-24 shrink-0 text-muted-foreground">{formatShortIndonesianDate(visit.startAt)}</span>
                <span>{visit.assessmentPreview ?? "—"}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
      {hasMore && (
        <p className="text-xs text-muted-foreground">
          Kunjungan lebih lama ada di{" "}
          <Link href={`/admin/pasien/${patientId}`} className="underline underline-offset-4">
            Data pasien
          </Link>
          .
        </p>
      )}
    </div>
  );
}

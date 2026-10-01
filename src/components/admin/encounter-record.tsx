import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TEXT_FIELDS } from "@/lib/encounter";
import type { EncounterDetail } from "@/server/encounter-read";

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-base font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RecordText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <h3 className="text-xs text-muted-foreground">{label}</h3>
      <p className="whitespace-pre-line text-sm">{value || "—"}</p>
    </div>
  );
}

/** Catatan kunjungan baca-saja: final, atau draf yang dibuka tanpa hak menulis. */
export function EncounterRecord({ encounter }: { encounter: EncounterDetail }) {
  const { draft } = encounter;
  return (
    <div className="space-y-6">
      <Part id="bagian-s" title="S — Subjective">
        <RecordText label={TEXT_FIELDS.subjective} value={draft.subjective} />
      </Part>
      <Part id="bagian-o" title="O — Objective">
        {encounter.vitalLines.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {encounter.vitalLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Tanda vital tidak diukur.</p>
        )}
        <RecordText label={TEXT_FIELDS.physicalExam} value={draft.physicalExam} />
      </Part>
      <Part id="bagian-a" title="A — Assessment">
        <RecordText label={TEXT_FIELDS.assessment} value={draft.assessment} />
      </Part>
      <Part id="bagian-p" title="P — Plan">
        <RecordText label={TEXT_FIELDS.plan} value={draft.plan} />
      </Part>
      <Part id="bagian-treatment" title="Treatment yang dilakukan">
        {encounter.treatments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada treatment di kunjungan ini.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Treatment</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Dosis</TableHead>
                <TableHead>Pelaksana</TableHead>
                <TableHead>Catatan pasca-tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {encounter.treatments.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{row.serviceName}</TableCell>
                  <TableCell>{row.area ?? "—"}</TableCell>
                  <TableCell>{row.dose ?? "—"}</TableCell>
                  <TableCell>{row.performerName}</TableCell>
                  <TableCell className="whitespace-pre-line">{row.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Part>
    </div>
  );
}

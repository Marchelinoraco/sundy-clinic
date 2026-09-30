import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { AuditTrailRow } from "@/server/audit";

/** "Jejak catatan ini" (spec bagian 9) — hanya diberikan untuk audit:read. */
export function AuditTrail({ rows }: { rows: AuditTrailRow[] }) {
  return (
    <details className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">Jejak catatan ini</summary>
      <div className="mt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu (WITA)</TableHead>
              <TableHead>Staf</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {formatShortIndonesianDate(row.at)}, {minutesToTimeLabel(witaMinutesOfDay(row.at))}
                </TableCell>
                <TableCell>
                  {row.actorName} ({row.roleLabel})
                </TableCell>
                <TableCell>{row.actionLabel}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

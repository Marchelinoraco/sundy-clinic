import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { DoctorWorklist, WorklistRow, WorklistState } from "@/server/encounter-read";
import { OpenEncounterButton } from "./open-encounter-button";

const STATE_LABEL: Record<WorklistState, string> = { BELUM: "Belum diperiksa", DRAF: "Draf", FINAL: "Final" };

function Action({ row }: { row: WorklistRow }) {
  if (row.state === "BELUM" || !row.encounterId) return <OpenEncounterButton appointmentId={row.appointmentId} />;
  return (
    <Link href={`/admin/kunjungan/${row.encounterId}`} className="text-sm underline underline-offset-4">
      {row.state === "DRAF" ? "Lanjutkan" : "Lihat"}
    </Link>
  );
}

function WorklistTable({ rows, withDate }: { rows: WorklistRow[]; withDate: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{withDate ? "Jadwal" : "Jam"}</TableHead>
          <TableHead>Pasien</TableHead>
          <TableHead>Layanan</TableHead>
          <TableHead>Cabang</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const time = minutesToTimeLabel(witaMinutesOfDay(row.startAt));
          return (
            <TableRow key={row.appointmentId}>
              <TableCell className="whitespace-nowrap">{withDate ? `${formatShortIndonesianDate(row.startAt)}, ${time}` : time}</TableCell>
              <TableCell>
                <div className="font-medium">{row.patientName}</div>
                <div className="font-mono text-xs text-muted-foreground">{row.patientRecordNumber}</div>
              </TableCell>
              <TableCell>{row.serviceName}</TableCell>
              <TableCell>{row.branchName}</TableCell>
              <TableCell>
                <Badge variant={row.state === "FINAL" ? "default" : "outline"}>{STATE_LABEL[row.state]}</Badge>
              </TableCell>
              <TableCell>
                <Action row={row} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Dasbor dokter (spec 4.2): pasien hari ini dan catatan yang tertinggal. */
export function DoctorWorklistView({ worklist }: { worklist: DoctorWorklist }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="pasien-hari-ini" className="space-y-2">
        <h2 id="pasien-hari-ini" className="text-base font-medium">
          Pasien hari ini
        </h2>
        {worklist.today.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pasien yang ditandai hadir hari ini.</p>
        ) : (
          <WorklistTable rows={worklist.today} withDate={false} />
        )}
      </section>
      <section aria-labelledby="catatan-belum-final" className="space-y-2">
        <h2 id="catatan-belum-final" className="text-base font-medium">
          Catatan belum final
        </h2>
        {worklist.unfinished.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada catatan yang tertinggal.</p>
        ) : (
          <WorklistTable rows={worklist.unfinished} withDate />
        )}
      </section>
    </div>
  );
}

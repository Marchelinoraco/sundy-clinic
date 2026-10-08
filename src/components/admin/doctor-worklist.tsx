import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { DoctorWorklist, WorklistRow, WorklistState } from "@/server/encounter-read";
import { TextLink } from "./mui/links";
import { StatusChip } from "./mui/status-chip";
import { OpenEncounterButton } from "./open-encounter-button";
import { EmptyState, SectionCard } from "./page-layout";

const STATE_LABEL: Record<WorklistState, string> = { BELUM: "Belum diperiksa", DRAF: "Draf", FINAL: "Final" };

function Action({ row }: { row: WorklistRow }) {
  if (row.state === "BELUM" || !row.encounterId) return <OpenEncounterButton appointmentId={row.appointmentId} />;
  return (
    <TextLink href={`/admin/kunjungan/${row.encounterId}`} underline="always" sx={{ fontSize: "0.875rem" }}>
      {row.state === "DRAF" ? "Lanjutkan" : "Lihat"}
    </TextLink>
  );
}

function WorklistTable({ rows, withDate }: { rows: WorklistRow[]; withDate: boolean }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{withDate ? "Jadwal" : "Jam"}</TableCell>
            <TableCell>Pasien</TableCell>
            <TableCell>Layanan</TableCell>
            <TableCell>Cabang</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Aksi</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const time = minutesToTimeLabel(witaMinutesOfDay(row.startAt));
            return (
              <TableRow key={row.appointmentId}>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{withDate ? `${formatShortIndonesianDate(row.startAt)}, ${time}` : time}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", fontWeight: 500 }}>
                    <span>{row.patientName}</span>
                    {row.foodRecallFilled && <StatusChip label="food recall ✓" />}
                    {row.online && <StatusChip label="Online" />}
                  </Stack>
                  <Box sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "text.secondary" }}>{row.patientRecordNumber}</Box>
                </TableCell>
                <TableCell>{row.serviceName}</TableCell>
                <TableCell>{row.branchName}</TableCell>
                <TableCell>
                  <StatusChip label={STATE_LABEL[row.state]} tone={row.state === "FINAL" ? "success" : "neutral"} />
                </TableCell>
                <TableCell>
                  <Action row={row} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Dasbor dokter (spec catatan dokter 4.2, spec D 4.4): pasien hari ini dan catatan yang tertinggal. */
export function DoctorWorklistView({ worklist }: { worklist: DoctorWorklist }) {
  return (
    <Stack spacing={3}>
      <SectionCard title="Pasien hari ini" flush>
        {worklist.today.length === 0 ? (
          <EmptyState>Belum ada pasien yang ditandai hadir hari ini.</EmptyState>
        ) : (
          <WorklistTable rows={worklist.today} withDate={false} />
        )}
      </SectionCard>
      <SectionCard title="Catatan belum final" flush>
        {worklist.unfinished.length === 0 ? (
          <EmptyState>Tidak ada catatan yang tertinggal.</EmptyState>
        ) : (
          <WorklistTable rows={worklist.unfinished} withDate />
        )}
      </SectionCard>
    </Stack>
  );
}

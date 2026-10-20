import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { NurseWorklistRow } from "@/server/nurse";
import { LinkButton } from "../mui/links";
import { StatusChip } from "../mui/status-chip";
import { EmptyState, SectionCard } from "../page-layout";

const FOOD_RECALL_LABEL: Record<NurseWorklistRow["foodRecall"], string> = { BELUM: "belum", TERISI: "terisi" };
const BIA_LABEL: Record<NurseWorklistRow["bia"], string> = { BELUM: "belum", BERKAS: "berkas", ANGKA: "angka" };

/** Dasbor Perawat (spec peran perawat 6): pasien klinik yang sudah check-in hari ini, dengan status food recall dan BIA. */
export function NurseWorklistView({ rows, title = "Pasien hari ini" }: { rows: NurseWorklistRow[]; title?: string }) {
  return (
    <SectionCard title={title} flush>
      {rows.length === 0 ? (
        <EmptyState>Belum ada pasien yang check-in hari ini.</EmptyState>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Jam</TableCell>
                <TableCell>Pasien</TableCell>
                <TableCell>Layanan</TableCell>
                <TableCell>Tenaga</TableCell>
                <TableCell>Food recall</TableCell>
                <TableCell>BIA</TableCell>
                <TableCell>Aksi</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.appointmentId}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{minutesToTimeLabel(witaMinutesOfDay(row.startAt))}</TableCell>
                  <TableCell>
                    <Box sx={{ fontWeight: 500 }}>{row.patientName}</Box>
                    <Box sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "text.secondary" }}>{row.patientRecordNumber}</Box>
                  </TableCell>
                  <TableCell>{row.serviceName}</TableCell>
                  <TableCell>{row.staffName}</TableCell>
                  <TableCell>
                    <StatusChip label={FOOD_RECALL_LABEL[row.foodRecall]} tone={row.foodRecall === "TERISI" ? "success" : "neutral"} />
                  </TableCell>
                  <TableCell>
                    <StatusChip label={BIA_LABEL[row.bia]} tone={row.bia === "ANGKA" ? "success" : "neutral"} />
                  </TableCell>
                  <TableCell>
                    <LinkButton href={`/admin/perawat/${row.appointmentId}`} size="small" variant="contained" aria-label={`Tangani ${row.patientName}`}>
                      Tangani
                    </LinkButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}

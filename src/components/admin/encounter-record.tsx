import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { TEXT_FIELDS } from "@/lib/encounter";
import type { EncounterDetail } from "@/server/encounter-read";

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Stack component="section" aria-labelledby={id} spacing={1.5}>
      <Typography id={id} component="h2" sx={{ fontSize: "1rem", fontWeight: 500 }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

function RecordText({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography component="h3" variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

/** Catatan kunjungan baca-saja: final, atau draf yang dibuka tanpa hak menulis. */
export function EncounterRecord({ encounter }: { encounter: EncounterDetail }) {
  const { draft } = encounter;
  return (
    <Stack spacing={3}>
      <Part id="bagian-s" title="S — Subjective">
        <RecordText label={TEXT_FIELDS.subjective} value={draft.subjective} />
      </Part>
      <Part id="bagian-o" title="O — Objective">
        {encounter.vitalLines.length > 0 ? (
          <Box component="ul" sx={{ m: 0, pl: 2.5, listStyle: "disc", fontSize: "0.875rem", "& > li + li": { mt: 0.25 } }}>
            {encounter.vitalLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Tanda vital tidak diukur.
          </Typography>
        )}
        <RecordText label={TEXT_FIELDS.physicalExam} value={draft.physicalExam} />
      </Part>
      <Part id="bagian-a" title="A — Assessment">
        <RecordText label={TEXT_FIELDS.assessment} value={draft.assessment} />
      </Part>
      <Part id="bagian-p" title="P — Plan">
        <RecordText label={TEXT_FIELDS.plan} value={draft.plan} />
        <RecordText label={TEXT_FIELDS.pharmacyNote} value={draft.pharmacyNote} />
      </Part>
      <Part id="bagian-treatment" title="Treatment yang dilakukan">
        {encounter.treatments.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Tidak ada treatment di kunjungan ini.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Treatment</TableCell>
                  <TableCell>Area</TableCell>
                  <TableCell>Dosis</TableCell>
                  <TableCell>Pelaksana</TableCell>
                  <TableCell>Catatan pasca-tindakan</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {encounter.treatments.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.serviceName}</TableCell>
                    <TableCell>{row.area ?? "—"}</TableCell>
                    <TableCell>{row.dose ?? "—"}</TableCell>
                    <TableCell>{row.performerName}</TableCell>
                    <TableCell sx={{ whiteSpace: "pre-line" }}>{row.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Part>
    </Stack>
  );
}

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
import { PHARMACY_NOTE_LABEL, TEXT_FIELDS } from "@/lib/encounter";
import { nurseVitalsLabel } from "@/lib/nurse-vitals";
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
  // Kunjungan lama mencatat pelaksana; yang baru tidak (dipilih resepsionis di tagihan, spec aturan pakai PL4).
  const withPerformer = encounter.treatments.some((row) => row.performerName);
  return (
    <Stack spacing={3}>
      <Part id="bagian-s" title="S — Subjective">
        <RecordText label={TEXT_FIELDS.subjective} value={draft.subjective} />
      </Part>
      <Part id="bagian-o" title="O — Objective">
        {encounter.nurseVitals && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {nurseVitalsLabel(encounter.nurseVitals)}
          </Typography>
        )}
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
        {encounter.pharmacyNote && <RecordText label={PHARMACY_NOTE_LABEL} value={encounter.pharmacyNote} />}
      </Part>
      <Part id="bagian-resep" title="Resep">
        {encounter.prescriptions.length === 0 && encounter.packages.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Tidak ada resep di kunjungan ini.
          </Typography>
        )}
        {encounter.prescriptions.length > 0 && (
          <TableContainer>
            <Table size="small" aria-label="Resep">
              <TableHead>
                <TableRow>
                  <TableCell>Obat</TableCell>
                  <TableCell align="right">Jumlah</TableCell>
                  <TableCell>Aturan pakai</TableCell>
                  <TableCell>Penagihan</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {encounter.prescriptions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.itemName}</TableCell>
                    <TableCell align="right">{row.quantity}</TableCell>
                    <TableCell>{row.usage}</TableCell>
                    <TableCell>{row.billing ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {encounter.packages.length > 0 && (
          // Paket yang disarankan dokter, dengan keterangan bila tidak dibeli (spec vital perawat PR1, PR3).
          <Box component="ul" aria-label="Paket" sx={{ m: 0, pl: 2.5, listStyle: "disc", fontSize: "0.875rem", "& > li + li": { mt: 0.25 } }}>
            {encounter.packages.map((row) => (
              <li key={row.id}>
                {row.name} · {row.contents}
                {row.declined && ` · ${row.declined}`}
              </li>
            ))}
          </Box>
        )}
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
                  {withPerformer && <TableCell>Pelaksana</TableCell>}
                  <TableCell>Catatan pasca-tindakan</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {encounter.treatments.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.serviceName}</TableCell>
                    <TableCell>{row.area ?? "—"}</TableCell>
                    <TableCell>{row.dose ?? "—"}</TableCell>
                    {withPerformer && <TableCell>{row.performerName ?? "—"}</TableCell>}
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

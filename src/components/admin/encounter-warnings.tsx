import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { EncounterWarnings } from "@/server/encounter-read";

function Warning({ label, text }: { label: string; text: string }) {
  return (
    <Box>
      <Typography component="p" sx={{ fontSize: "0.75rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
        {text}
      </Typography>
    </Box>
  );
}

/** Kotak peringatan di atas setiap kunjungan (spec R6, bagian 5). Bagian kosong tidak ditampilkan. */
export function EncounterWarningsBox({ warnings }: { warnings: EncounterWarnings }) {
  const recordMissing = !warnings.allergies && !warnings.medicalHistory;
  return (
    <Paper
      component="section"
      aria-labelledby="peringatan"
      variant="outlined"
      sx={{ p: 2, borderColor: "warning.main", bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.08)" }}
    >
      <Stack spacing={1}>
        <Typography id="peringatan" component="h2" sx={{ fontSize: "1rem", fontWeight: 500 }}>
          Peringatan
        </Typography>
        {recordMissing ? (
          <Typography variant="body2">Alergi dan riwayat penyakit belum dicatat.</Typography>
        ) : (
          <>
            {warnings.allergies && <Warning label="Alergi" text={warnings.allergies} />}
            {warnings.medicalHistory && <Warning label="Riwayat penyakit & obat" text={warnings.medicalHistory} />}
          </>
        )}
        {warnings.importantNotes && <Warning label="Catatan penting" text={warnings.importantNotes} />}
        {warnings.pregnancy && (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Hamil, merencanakan kehamilan, atau menyusui (dari isian kunjungan ini)
          </Typography>
        )}
        {warnings.paperRecordNumber && <Typography variant="body2">Ada berkas kertas: {warnings.paperRecordNumber}</Typography>}
      </Stack>
    </Paper>
  );
}

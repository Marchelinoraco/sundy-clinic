import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatDateWithYear } from "@/lib/format";
import type { PrescriptionLabelData } from "@/server/invoice-read";

/** Etiket obat resep dokter untuk customer (spec resep dokter 5): tanpa harga dan tanpa data klinis. */
export function PrescriptionLabel({ data, clinicName }: { data: PrescriptionLabelData; clinicName: string }) {
  return (
    <Paper component="article" aria-label="Etiket obat" variant="outlined" sx={{ mx: "auto", width: "100%", maxWidth: 448, p: 2, "@media print": { border: 0 } }}>
      <Stack spacing={1.5}>
        <Box component="header" sx={{ pb: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography sx={{ fontSize: "1rem", fontWeight: 600 }}>{clinicName}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {data.patientName}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {formatDateWithYear(data.startAt)} · {data.doctorName}
          </Typography>
        </Box>
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {data.lines.map((line, index) => (
            <li key={index}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {line.name}
              </Typography>
              <Typography variant="body2">Jumlah: {line.quantity}</Typography>
              <Typography variant="body2">{line.usage}</Typography>
            </li>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}

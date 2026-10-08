import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { formatDateWithYear } from "@/lib/format";
import type { DispensingDetail } from "@/server/dispensing-read";
import { TextLink } from "../mui/links";
import { DispensingStatusBadge } from "./dispensing-status-badge";
import { ReopenDispensingButton } from "./reopen-dispensing-button";

/** Penyerahan yang sudah diproses (Selesai atau Tanpa obat). */
export function DispensingSummary({ detail }: { detail: DispensingDetail }) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        <DispensingStatusBadge status={detail.status} />
        {detail.completedAt && (
          <Typography variant="body2" component="span" sx={{ color: "text.secondary" }}>
            {formatDateWithYear(detail.completedAt)} oleh {detail.completedByName}
          </Typography>
        )}
      </Stack>
      {detail.lines.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Obat</TableCell>
                <TableCell align="right">Jumlah</TableCell>
                <TableCell>Aturan pakai</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell sx={{ fontWeight: 500 }}>{line.itemName}</TableCell>
                  <TableCell align="right">{line.quantity}</TableCell>
                  <TableCell>{line.usage}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        {detail.lines.length > 0 && (
          <TextLink href={`/admin/resep/${detail.id}/etiket`} underline="always" sx={{ fontSize: "0.875rem" }}>
            Cetak etiket
          </TextLink>
        )}
        {detail.canReopen ? (
          <ReopenDispensingButton dispensingId={detail.id} />
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Tidak bisa dibuka kembali karena tagihan sudah final.
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}

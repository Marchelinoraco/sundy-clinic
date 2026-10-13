import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { TextLink } from "../mui/links";
import { formatRupiah } from "@/lib/format";
import type { PayrollItemRow } from "@/server/payroll-read";
import { EmptyState, SectionCard } from "../page-layout";
import { PayrollItemActions } from "./payroll-item-actions";

/** Baris penggajian satu bulan (spec karyawan 5). Komisi menaut ke rincian di laporan Komisi. */
export function PayrollTable({ month, items, today }: { month: string; items: PayrollItemRow[]; today: string }) {
  return (
    <SectionCard title={`Penggajian ${month}`} description={`${items.length} karyawan`} flush>
      {items.length === 0 ? (
        <EmptyState>Belum ada karyawan di penggajian ini.</EmptyState>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Karyawan</TableCell>
                <TableCell align="right">Gaji pokok</TableCell>
                <TableCell align="right">Tunjangan</TableCell>
                <TableCell align="right">Komisi</TableCell>
                <TableCell align="right">Bonus</TableCell>
                <TableCell align="right">Potongan</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {item.employeeName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {item.position}
                      {item.amountNote ? ` · ${item.amountNote}` : ""}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatRupiah(item.baseSalary)}</TableCell>
                  <TableCell align="right">{formatRupiah(item.allowance)}</TableCell>
                  <TableCell align="right">
                    {item.staffId ? (
                      <TextLink href={`/admin/laporan?tab=komisi&pelaksana=${item.staffId}`}>{formatRupiah(item.commission)}</TextLink>
                    ) : (
                      formatRupiah(item.commission)
                    )}
                    <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                      {item.treatments} treatment
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatRupiah(item.bonusTotal)}</TableCell>
                  <TableCell align="right">{formatRupiah(item.deductionTotal)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatRupiah(item.total)}
                  </TableCell>
                  <TableCell>{item.paidAt ? `Dibayar ${item.paidAt}` : "Belum dibayar"}</TableCell>
                  <TableCell align="right">
                    <PayrollItemActions month={month} item={item} today={today} />
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

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear } from "@/lib/format";
import type { DispensingDetail } from "@/server/dispensing-read";
import { DispensingStatusBadge } from "./dispensing-status-badge";
import { ReopenDispensingButton } from "./reopen-dispensing-button";

/** Penyerahan yang sudah diproses (Selesai atau Tanpa obat). */
export function DispensingSummary({ detail }: { detail: DispensingDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <DispensingStatusBadge status={detail.status} />
        {detail.completedAt && (
          <span className="text-muted-foreground">
            {formatDateWithYear(detail.completedAt)} oleh {detail.completedByName}
          </span>
        )}
      </div>
      {detail.lines.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obat</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Aturan pakai</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.itemName}</TableCell>
                <TableCell className="text-right">{line.quantity}</TableCell>
                <TableCell>{line.usage}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {detail.lines.length > 0 && (
          <Link href={`/admin/resep/${detail.id}/etiket`} className="text-sm underline underline-offset-4">
            Cetak etiket
          </Link>
        )}
        {detail.canReopen ? (
          <ReopenDispensingButton dispensingId={detail.id} />
        ) : (
          <p className="text-sm text-muted-foreground">Tidak bisa dibuka kembali karena tagihan sudah final.</p>
        )}
      </div>
    </div>
  );
}

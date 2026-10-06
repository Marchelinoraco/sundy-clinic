import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { CancelPurchaseDialog } from "@/components/admin/stock/cancel-purchase-dialog";
import { PurchasePaymentsSection } from "@/components/admin/stock/purchase-payments-section";
import { PayableStatusBadge } from "@/components/admin/stock/payable-status-badge";
import { SupplierReturnDialog } from "@/components/admin/stock/supplier-return-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { dateLabel } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { getPurchaseDetail } from "@/server/purchase-read";
import { requireCapability } from "@/server/session";

export const metadata = { title: "Faktur" };

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("stock:read");
  const detail = await getPurchaseDetail((await params).id);
  if (!detail) notFound();
  const canManage = can(staff.role, "stock:manage");
  const canCancel = detail.canCancel && (canManage || can(staff.role, "payable:manage"));
  const returnable =
    canManage && detail.cancelledAt === null ? detail.lines.filter((line) => line.batchRemaining > 0) : [];

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title={`Faktur ${detail.invoiceNumber}`}
          trail={[{ label: "Stok", href: "/admin/stok" }, { label: "Barang masuk", href: "/admin/stok?tab=masuk" }, { label: detail.invoiceNumber }]}
          description={`${detail.supplierName} · ${detail.branchName}`}
          actions={
            <>
              {returnable.length > 0 && (
                <SupplierReturnDialog
                  invoiceId={detail.id}
                  lines={returnable.map((line) => ({
                    batchId: line.batchId,
                    label: `${line.itemName} batch ${line.batchNumber ?? "-"}`,
                    remaining: line.batchRemaining,
                    unitCost: line.unitCost,
                    unit: line.unit,
                  }))}
                />
              )}
              {canCancel && <CancelPurchaseDialog invoiceId={detail.id} invoiceNumber={detail.invoiceNumber} />}
            </>
          }
        />

        {detail.cancelledAt && (
          <p role="status" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            Dibatalkan {formatDateWithYear(detail.cancelledAt)} oleh {detail.cancelledByName}: {detail.cancelReason}
          </p>
        )}

        <SectionCard title="Faktur">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Tanggal faktur</dt>
              <dd>{dateLabel(detail.invoiceDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Jatuh tempo</dt>
              <dd>{dateLabel(detail.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <PayableStatusBadge status={detail.summary.status} overdue={detail.summary.overdue} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-lg font-semibold">{formatRupiah(detail.total)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dicatat oleh</dt>
              <dd>
                {detail.createdByName}, {formatDateWithYear(detail.createdAt)}
              </dd>
            </div>
            {detail.notes && (
              <div>
                <dt className="text-muted-foreground">Catatan</dt>
                <dd>{detail.notes}</dd>
              </div>
            )}
          </dl>
        </SectionCard>

        {detail.payments && (
          <PurchasePaymentsSection
            invoiceId={detail.id}
            invoiceDate={detail.invoiceDate}
            dueDate={detail.dueDate}
            today={witaDateString(new Date())}
            total={detail.total}
            summary={detail.summary}
            payments={detail.payments}
            cancelled={detail.cancelledAt !== null}
          />
        )}

        <SectionCard title="Barang" flush>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Barang</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Harga beli</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Sisa batch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.itemName}
                    <div className="font-mono text-xs text-muted-foreground">{line.itemCode}</div>
                  </TableCell>
                  <TableCell>{line.batchNumber ?? "—"}</TableCell>
                  <TableCell>{dateLabel(line.expiryDate)}</TableCell>
                  <TableCell className="text-right">
                    {line.quantity} {line.unit}
                  </TableCell>
                  <TableCell className="text-right">{formatRupiah(line.unitCost)}</TableCell>
                  <TableCell className="text-right">{formatRupiah(line.amount)}</TableCell>
                  <TableCell className="text-right">
                    {line.batchRemaining} {line.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="Retur" flush>
          {detail.returns.length === 0 ? (
            <EmptyState>Belum ada retur.</EmptyState>
          ) : (
            <ul className="divide-y text-sm">
              {detail.returns.map((r) => (
                <li key={r.id} className="space-y-1 p-4">
                  <div className="font-medium">
                    {formatDateWithYear(r.createdAt)} · {r.staffName} · {formatRupiah(r.total)}
                  </div>
                  {r.lines.map((line, index) => (
                    <div key={index} className="text-muted-foreground">
                      {line.itemName} batch {line.batchNumber ?? "-"}: {line.quantity} · {formatRupiah(line.amount)}
                    </div>
                  ))}
                  {r.note && <div>{r.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}

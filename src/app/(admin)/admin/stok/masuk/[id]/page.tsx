import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { CancelPurchaseDialog } from "@/components/admin/stock/cancel-purchase-dialog";
import { PurchasePaymentsSection } from "@/components/admin/stock/purchase-payments-section";
import { PayableStatusBadge } from "@/components/admin/stock/payable-status-badge";
import { SupplierReturnDialog } from "@/components/admin/stock/supplier-return-dialog";
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
          <Typography
            role="status"
            variant="body2"
            sx={{ p: 1.5, border: 1, borderColor: "error.main", borderRadius: 1, bgcolor: "rgba(var(--mui-palette-error-mainChannel) / 0.06)" }}
          >
            Dibatalkan {formatDateWithYear(detail.cancelledAt)} oleh {detail.cancelledByName}: {detail.cancelReason}
          </Typography>
        )}

        <SectionCard title="Faktur">
          <Box
            component="dl"
            sx={{
              m: 0,
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
              fontSize: "0.875rem",
              "& dt": { color: "text.secondary" },
              "& dd": { m: 0 },
            }}
          >
            <div>
              <dt>Tanggal faktur</dt>
              <dd>{dateLabel(detail.invoiceDate)}</dd>
            </div>
            <div>
              <dt>Jatuh tempo</dt>
              <dd>{dateLabel(detail.dueDate)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <PayableStatusBadge status={detail.summary.status} overdue={detail.summary.overdue} />
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <Box component="dd" sx={{ fontSize: "1.125rem", fontWeight: 600 }}>
                {formatRupiah(detail.total)}
              </Box>
            </div>
            <div>
              <dt>Dicatat oleh</dt>
              <dd>
                {detail.createdByName}, {formatDateWithYear(detail.createdAt)}
              </dd>
            </div>
            {detail.notes && (
              <div>
                <dt>Catatan</dt>
                <dd>{detail.notes}</dd>
              </div>
            )}
          </Box>
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
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Barang</TableCell>
                  <TableCell>Batch</TableCell>
                  <TableCell>Kedaluwarsa</TableCell>
                  <TableCell align="right">Jumlah</TableCell>
                  <TableCell align="right">Harga beli</TableCell>
                  <TableCell align="right">Subtotal</TableCell>
                  <TableCell align="right">Sisa batch</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {detail.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      {line.itemName}
                      <Typography component="div" sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "text.secondary" }}>
                        {line.itemCode}
                      </Typography>
                    </TableCell>
                    <TableCell>{line.batchNumber ?? "—"}</TableCell>
                    <TableCell>{dateLabel(line.expiryDate)}</TableCell>
                    <TableCell align="right">
                      {line.quantity} {line.unit}
                    </TableCell>
                    <TableCell align="right">{formatRupiah(line.unitCost)}</TableCell>
                    <TableCell align="right">{formatRupiah(line.amount)}</TableCell>
                    <TableCell align="right">
                      {line.batchRemaining} {line.unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>

        <SectionCard title="Retur" flush>
          {detail.returns.length === 0 ? (
            <EmptyState>Belum ada retur.</EmptyState>
          ) : (
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, fontSize: "0.875rem", "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
              {detail.returns.map((r) => (
                <Box component="li" key={r.id} sx={{ p: 2, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Box sx={{ fontWeight: 500 }}>
                    {formatDateWithYear(r.createdAt)} · {r.staffName} · {formatRupiah(r.total)}
                  </Box>
                  {r.lines.map((line, index) => (
                    <Box key={index} sx={{ color: "text.secondary" }}>
                      {line.itemName} batch {line.batchNumber ?? "-"}: {line.quantity} · {formatRupiah(line.amount)}
                    </Box>
                  ))}
                  {r.note && <div>{r.note}</div>}
                </Box>
              ))}
            </Box>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}

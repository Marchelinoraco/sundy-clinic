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
import { TextLink } from "@/components/admin/mui/links";
import { StatusChip } from "@/components/admin/mui/status-chip";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { AdjustStockDialog } from "@/components/admin/stock/adjust-stock-dialog";
import { StockItemActiveButton } from "@/components/admin/stock/stock-item-active-button";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ADJUST_REASON_LABEL, dateLabel, MOVEMENT_KIND_LABEL, STOCK_ITEM_KIND_LABEL } from "@/lib/stock";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { getStockItemDetail } from "@/server/stock-read";

export const metadata = { title: "Detail barang" };

export default async function StockItemPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCapability("stock:read");
  const detail = await getStockItemDetail((await params).id);
  if (!detail) notFound();
  const { item, batches, movements } = detail;
  const canManage = can(staff.role, "stock:manage");

  return (
    <>
      <AdminHeader title="Stok" />
      <PageBody>
        <PageHeader
          title={item.name}
          trail={[{ label: "Stok", href: "/admin/stok" }, { label: item.code }]}
          description={`${STOCK_ITEM_KIND_LABEL[item.kind]} · satuan ${item.unit} · harga jual ${
            item.sellPrice === null ? "belum diisi" : formatRupiah(item.sellPrice)
          } · batas menipis ${item.minStock}`}
          actions={
            canManage ? (
              <>
                <StockItemDialog
                  itemId={item.id}
                  triggerLabel="Ubah barang"
                  initial={{
                    code: item.code,
                    name: item.name,
                    kind: item.kind,
                    unit: item.unit,
                    sellPrice: item.sellPrice,
                    minStock: item.minStock,
                    notes: item.notes ?? "",
                  }}
                />
                <StockItemActiveButton itemId={item.id} active={item.isActive} />
              </>
            ) : undefined
          }
        />
        {!item.isActive && (
          <Box>
            <StatusChip label="Nonaktif" />
          </Box>
        )}

        <SectionCard title="Batch" flush>
          {batches.length === 0 ? (
            <EmptyState>Belum ada stok untuk barang ini.</EmptyState>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cabang</TableCell>
                    <TableCell>Batch</TableCell>
                    <TableCell>Kedaluwarsa</TableCell>
                    <TableCell align="right">Sisa</TableCell>
                    <TableCell align="right">Harga beli</TableCell>
                    <TableCell>Faktur</TableCell>
                    {canManage && <TableCell>Aksi</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>{batch.branchName}</TableCell>
                      <TableCell>{batch.batchNumber ?? "—"}</TableCell>
                      <TableCell>
                        {dateLabel(batch.expiryDate)}
                        {batch.expired && (
                          <Box component="span" sx={{ ml: 1 }}>
                            <StatusChip label="Kedaluwarsa" tone="error" />
                          </Box>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {batch.quantityRemaining} {item.unit}
                      </TableCell>
                      <TableCell align="right">{formatRupiah(batch.unitCost)}</TableCell>
                      <TableCell>
                        <TextLink href={`/admin/stok/masuk/${batch.invoiceId}`}>{batch.invoiceNumber}</TextLink>
                        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                          {batch.supplierName}
                        </Typography>
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          {!batch.invoiceCancelled && (
                            <AdjustStockDialog
                              batch={{
                                id: batch.id,
                                label: `${item.name} batch ${batch.batchNumber ?? "-"}`,
                                remaining: batch.quantityRemaining,
                                unit: item.unit,
                              }}
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>

        <SectionCard title="Riwayat stok" description="100 perubahan terakhir, terbaru di atas." flush>
          {movements.length === 0 ? (
            <EmptyState>Belum ada perubahan stok.</EmptyState>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Waktu</TableCell>
                    <TableCell>Jenis</TableCell>
                    <TableCell align="right">Jumlah</TableCell>
                    <TableCell>Batch</TableCell>
                    <TableCell>Staf</TableCell>
                    <TableCell>Keterangan</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {formatDateWithYear(movement.createdAt)} {minutesToTimeLabel(witaMinutesOfDay(movement.createdAt))}
                      </TableCell>
                      <TableCell>{MOVEMENT_KIND_LABEL[movement.kind]}</TableCell>
                      <TableCell align="right">
                        {movement.quantity > 0 ? "+" : ""}
                        {movement.quantity}
                      </TableCell>
                      <TableCell>
                        {movement.batchNumber ?? "—"}
                        <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                          {movement.branchName}
                        </Typography>
                      </TableCell>
                      <TableCell>{movement.staffName}</TableCell>
                      <TableCell>
                        {movement.reason ? ADJUST_REASON_LABEL[movement.reason] : ""}
                        {movement.note && (
                          <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                            {movement.note}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}

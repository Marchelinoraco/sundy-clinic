import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { EmptyState, PageBody, PageHeader, SectionCard } from "@/components/admin/page-layout";
import { AdjustStockDialog } from "@/components/admin/stock/adjust-stock-dialog";
import { StockItemActiveButton } from "@/components/admin/stock/stock-item-active-button";
import { StockItemDialog } from "@/components/admin/stock/stock-item-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        {!item.isActive && <Badge variant="outline">Nonaktif</Badge>}

        <SectionCard title="Batch" flush>
          {batches.length === 0 ? (
            <EmptyState>Belum ada stok untuk barang ini.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Kedaluwarsa</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead className="text-right">Harga beli</TableHead>
                  <TableHead>Faktur</TableHead>
                  {canManage && <TableHead>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>{batch.branchName}</TableCell>
                    <TableCell>{batch.batchNumber ?? "—"}</TableCell>
                    <TableCell>
                      {dateLabel(batch.expiryDate)}
                      {batch.expired && (
                        <Badge variant="destructive" className="ml-2">
                          Kedaluwarsa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {batch.quantityRemaining} {item.unit}
                    </TableCell>
                    <TableCell className="text-right">{formatRupiah(batch.unitCost)}</TableCell>
                    <TableCell>
                      <Link href={`/admin/stok/masuk/${batch.invoiceId}`} className="underline-offset-4 hover:underline">
                        {batch.invoiceNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">{batch.supplierName}</div>
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
          )}
        </SectionCard>

        <SectionCard title="Riwayat stok" description="100 perubahan terakhir, terbaru di atas." flush>
          {movements.length === 0 ? (
            <EmptyState>Belum ada perubahan stok.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Staf</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateWithYear(movement.createdAt)} {minutesToTimeLabel(witaMinutesOfDay(movement.createdAt))}
                    </TableCell>
                    <TableCell>{MOVEMENT_KIND_LABEL[movement.kind]}</TableCell>
                    <TableCell className="text-right">
                      {movement.quantity > 0 ? "+" : ""}
                      {movement.quantity}
                    </TableCell>
                    <TableCell>
                      {movement.batchNumber ?? "—"}
                      <div className="text-xs text-muted-foreground">{movement.branchName}</div>
                    </TableCell>
                    <TableCell>{movement.staffName}</TableCell>
                    <TableCell>
                      {movement.reason ? ADJUST_REASON_LABEL[movement.reason] : ""}
                      {movement.note && <div className="text-xs text-muted-foreground">{movement.note}</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </PageBody>
    </>
  );
}

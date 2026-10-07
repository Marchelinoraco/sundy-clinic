import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { INVOICE_LINE_KIND_LABEL } from "@/lib/invoice";
import { dateLabel, PAYMENT_METHOD_LABEL } from "@/lib/stock";
import type { InvoiceDetail } from "@/server/invoice-read";
import { SectionCard } from "../page-layout";
import { CancelInvoiceDialog } from "./cancel-invoice-dialog";
import { FinalDiscountDialog } from "./final-discount-dialog";
import { InvoicePaymentDialog } from "./invoice-payment-dialog";
import { PrintButton } from "./print-button";
import { RevokeInvoicePaymentDialog } from "./revoke-invoice-payment-dialog";

/** Tagihan final atau dibatalkan (spec tagihan 4.4–5): baris terkunci, pembayaran, koreksi, dan cetak. */
export function InvoiceFinalView({
  detail,
  today,
  canManage,
  canCorrect,
  canSeeCost,
}: {
  detail: InvoiceDetail;
  today: string;
  canManage: boolean;
  canCorrect: boolean;
  canSeeCost: boolean;
}) {
  const { totals } = detail;
  const isFinal = detail.status === "FINAL";
  const finalizedDate = detail.finalizedAt ? new Date(detail.finalizedAt.getTime() + 8 * 3600_000).toISOString().slice(0, 10) : today;
  const canPay = canManage && isFinal && totals.balance > 0;
  const canDiscount = canCorrect && isFinal && totals.display !== "LUNAS";
  const canCancel = isFinal && (canCorrect || (canManage && !detail.everPaid));

  return (
    <div className="space-y-6">
      {detail.cancelledAt && (
        <p role="status" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Dibatalkan {formatDateWithYear(detail.cancelledAt)} oleh {detail.cancelledByName}: {detail.cancelReason}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <PrintButton />
        {canDiscount && (
          <FinalDiscountDialog invoiceId={detail.id} subtotal={totals.subtotal} currentDiscount={totals.discount} paid={totals.paid} />
        )}
        {canCancel && <CancelInvoiceDialog invoiceId={detail.id} label={detail.number ?? "Tagihan"} />}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Jumlah</TableHead>
            <TableHead className="text-right">Harga</TableHead>
            <TableHead className="text-right">Jumlah harga</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                <span className="font-medium">{line.name}</span>
                <div className="text-xs text-muted-foreground">
                  {INVOICE_LINE_KIND_LABEL[line.kind]}
                  {line.priceNote && ` · ${line.priceNote}`}
                </div>
              </TableCell>
              <TableCell className="text-right">{line.quantity}</TableCell>
              <TableCell className="text-right">{formatRupiah(line.unitPrice)}</TableCell>
              <TableCell className="text-right">{formatRupiah(line.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <section aria-label="Ringkasan tagihan" className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRupiah(totals.subtotal)}</span>
        </div>
        {totals.discount > 0 && (
          <div>
            <div className="flex justify-between">
              <span>Diskon</span>
              <span>-{formatRupiah(totals.discount)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {detail.discountReason}
              {detail.discountByName && ` (${detail.discountByName})`}
            </p>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>{formatRupiah(totals.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Dibayar</span>
          <span>{formatRupiah(totals.paid)}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>Sisa</span>
          <span>{formatRupiah(totals.balance)}</span>
        </div>
        {canSeeCost && detail.cost !== null && (
          <p className="pt-2 text-xs text-muted-foreground print:hidden">Harga pokok barang {formatRupiah(detail.cost)}</p>
        )}
      </section>

      <div>
        <SectionCard
          title="Pembayaran"
          flush
          actions={
            canPay ? <InvoicePaymentDialog invoiceId={detail.id} limit={totals.balance} finalizedDate={finalizedDate} today={today} /> : undefined
          }
        >
          {detail.payments.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Belum ada pembayaran.</p>
          ) : (
            <ul className="divide-y text-sm">
              {detail.payments.map((payment) => {
                const label = `${formatRupiah(payment.amount)} ${dateLabel(payment.paidAt)}`;
                return (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span className={payment.revokedAt ? "text-muted-foreground line-through" : undefined}>
                      {dateLabel(payment.paidAt)} · {formatRupiah(payment.amount)} · {PAYMENT_METHOD_LABEL[payment.method]}
                      {payment.reference && ` · ${payment.reference}`}
                      <span className="block text-xs">{payment.staffName}</span>
                    </span>
                    {payment.revokedAt ? (
                      <span className="text-xs text-destructive">
                        Dibatalkan oleh {payment.revokedByName}: {payment.revokeReason}
                      </span>
                    ) : (
                      canCorrect && <RevokeInvoicePaymentDialog paymentId={payment.id} label={label} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

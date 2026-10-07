import { formatRupiah } from "@/lib/format";
import { dateLabel, PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, type PayableSummary } from "@/lib/stock";
import type { SupplierPaymentRow } from "@/server/purchase-read";
import { EmptyState, SectionCard } from "../page-layout";
import { DueDateDialog } from "./due-date-dialog";
import { PaymentDialog } from "./payment-dialog";
import { RevokePaymentDialog } from "./revoke-payment-dialog";

/** Bagian Pembayaran di detail faktur, hanya untuk payable:manage (spec stok 6.2–6.3). */
export function PurchasePaymentsSection({
  invoiceId,
  invoiceDate,
  dueDate,
  today,
  total,
  summary,
  payments,
  cancelled,
}: {
  invoiceId: string;
  invoiceDate: string;
  dueDate: string;
  today: string;
  total: number;
  summary: PayableSummary;
  payments: SupplierPaymentRow[];
  cancelled: boolean;
}) {
  const actions = cancelled ? undefined : (
    <>
      {summary.balance > 0 && <PaymentDialog invoiceId={invoiceId} kind="BAYAR" limit={summary.balance} invoiceDate={invoiceDate} today={today} />}
      {summary.balance < 0 && (
        <PaymentDialog invoiceId={invoiceId} kind="PENGEMBALIAN" limit={-summary.balance} invoiceDate={invoiceDate} today={today} />
      )}
      <DueDateDialog invoiceId={invoiceId} dueDate={dueDate} invoiceDate={invoiceDate} />
    </>
  );

  return (
    <SectionCard title="Pembayaran" actions={actions}>
      <dl className="grid gap-4 text-sm sm:grid-cols-5">
        <div>
          <dt className="text-muted-foreground">Total faktur</dt>
          <dd>{formatRupiah(total)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dibayar</dt>
          <dd>{formatRupiah(summary.paid)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Retur</dt>
          <dd>{formatRupiah(summary.returned)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pengembalian dana</dt>
          <dd>{formatRupiah(summary.refunded)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{summary.balance < 0 ? "Kredit dari supplier" : "Sisa hutang"}</dt>
          <dd className="text-lg font-semibold">{formatRupiah(Math.abs(summary.balance))}</dd>
        </div>
      </dl>

      {payments.length === 0 ? (
        <EmptyState>Belum ada pembayaran.</EmptyState>
      ) : (
        <ul className="mt-4 divide-y text-sm">
          {payments.map((payment) => {
            const label = `${dateLabel(payment.paidAt)} ${formatRupiah(payment.amount)}`;
            return (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className={payment.revokedAt ? "text-muted-foreground line-through" : undefined}>
                  {dateLabel(payment.paidAt)} · {PAYMENT_KIND_LABEL[payment.kind]} · {PAYMENT_METHOD_LABEL[payment.method]} ·{" "}
                  <strong>{formatRupiah(payment.amount)}</strong>
                  {payment.reference && <> · {payment.reference}</>} · {payment.staffName}
                </div>
                {payment.revokedAt ? (
                  <div className="text-xs text-destructive">
                    Dibatalkan {payment.revokedByName}: {payment.revokeReason}
                  </div>
                ) : (
                  !cancelled && <RevokePaymentDialog paymentId={payment.id} label={label} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

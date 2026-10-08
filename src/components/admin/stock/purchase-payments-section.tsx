import Box from "@mui/material/Box";
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
      <Box
        component="dl"
        sx={{
          m: 0,
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(5, 1fr)" },
          fontSize: "0.875rem",
          "& dt": { color: "text.secondary" },
          "& dd": { m: 0 },
        }}
      >
        <div>
          <dt>Total faktur</dt>
          <dd>{formatRupiah(total)}</dd>
        </div>
        <div>
          <dt>Dibayar</dt>
          <dd>{formatRupiah(summary.paid)}</dd>
        </div>
        <div>
          <dt>Retur</dt>
          <dd>{formatRupiah(summary.returned)}</dd>
        </div>
        <div>
          <dt>Pengembalian dana</dt>
          <dd>{formatRupiah(summary.refunded)}</dd>
        </div>
        <div>
          <dt>{summary.balance < 0 ? "Kredit dari supplier" : "Sisa hutang"}</dt>
          <Box component="dd" sx={{ fontSize: "1.125rem", fontWeight: 600 }}>
            {formatRupiah(Math.abs(summary.balance))}
          </Box>
        </div>
      </Box>

      {payments.length === 0 ? (
        <EmptyState>Belum ada pembayaran.</EmptyState>
      ) : (
        <Box component="ul" sx={{ listStyle: "none", m: 0, mt: 2, p: 0, fontSize: "0.875rem", "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
          {payments.map((payment) => {
            const label = `${dateLabel(payment.paidAt)} ${formatRupiah(payment.amount)}`;
            return (
              <Box
                component="li"
                key={payment.id}
                sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1, py: 1 }}
              >
                <Box sx={payment.revokedAt ? { color: "text.secondary", textDecoration: "line-through" } : undefined}>
                  {dateLabel(payment.paidAt)} · {PAYMENT_KIND_LABEL[payment.kind]} · {PAYMENT_METHOD_LABEL[payment.method]} ·{" "}
                  <strong>{formatRupiah(payment.amount)}</strong>
                  {payment.reference && <> · {payment.reference}</>} · {payment.staffName}
                </Box>
                {payment.revokedAt ? (
                  <Box sx={{ fontSize: "0.75rem", color: "error.main" }}>
                    Dibatalkan {payment.revokedByName}: {payment.revokeReason}
                  </Box>
                ) : (
                  !cancelled && <RevokePaymentDialog paymentId={payment.id} label={label} />
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </SectionCard>
  );
}

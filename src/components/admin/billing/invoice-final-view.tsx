import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { formatDateWithYear, formatRupiah } from "@/lib/format";
import { INVOICE_LINE_KIND_LABEL } from "@/lib/invoice";
import type { PublicReceipt } from "@/lib/receipt";
import type { ClinicBankAccountView } from "@/server/clinic-bank";
import { dateLabel, PAYMENT_METHOD_LABEL } from "@/lib/stock";
import type { InvoiceDetail } from "@/server/invoice-read";
import { SectionCard } from "../page-layout";
import { CancelInvoiceDialog } from "./cancel-invoice-dialog";
import { FinalDiscountDialog } from "./final-discount-dialog";
import { InvoiceNotesForm } from "./invoice-notes-form";
import { InvoicePaymentDialog } from "./invoice-payment-dialog";
import { LineDiscountNote } from "./line-discount-dialog";
import { PrintButton } from "./print-button";
import { ReceiptPrintButton } from "./receipt-print-button";
import { ReceiptResetDialog } from "./receipt-reset-dialog";
import { ReceiptSendDialog } from "./receipt-send-dialog";
import { RevokeInvoicePaymentDialog } from "./revoke-invoice-payment-dialog";

/** Tagihan final atau dibatalkan (spec tagihan 4.4–5): baris terkunci, pembayaran, koreksi, dan cetak. */
export function InvoiceFinalView({
  detail,
  today,
  canManage,
  canCorrect,
  canSeeCost,
  receipt = null,
  canEditNotes = false,
  bankAccounts = [],
}: {
  detail: InvoiceDetail;
  today: string;
  canManage: boolean;
  canCorrect: boolean;
  canSeeCost: boolean;
  /** Struk untuk dikirim dan dicetak (spec struk WA 5–7); null untuk tagihan dibatalkan. */
  receipt?: PublicReceipt | null;
  /** Catatan internal boleh diubah (invoice:manage atau invoice:correct). */
  canEditNotes?: boolean;
  /** Rekening klinik aktif untuk dialog pembayaran transfer. */
  bankAccounts?: ClinicBankAccountView[];
}) {
  const { totals } = detail;
  const isFinal = detail.status === "FINAL";
  const finalizedDate = detail.finalizedAt ? new Date(detail.finalizedAt.getTime() + 8 * 3600_000).toISOString().slice(0, 10) : today;
  const canPay = canManage && isFinal && totals.balance > 0;
  const canDiscount = canCorrect && isFinal && totals.display !== "LUNAS";
  const canCancel = isFinal && (canCorrect || (canManage && !detail.everPaid));
  const canSendReceipt = canManage && isFinal && receipt !== null;

  const row = { justifyContent: "space-between" } as const;

  return (
    <>
      {/* Isi tagihan disembunyikan saat dicetak hanya bila ada struk penggantinya (tagihan dibatalkan tetap tercetak utuh). */}
      <Stack spacing={3} className={receipt ? "struk-tanpa-cetak" : undefined}>
        {detail.cancelledAt && (
          <Typography
            role="status"
            variant="body2"
            sx={{ p: 1.5, border: 1, borderColor: "error.main", borderRadius: 1, bgcolor: "rgba(var(--mui-palette-error-mainChannel) / 0.06)" }}
          >
            Dibatalkan {formatDateWithYear(detail.cancelledAt)} oleh {detail.cancelledByName}: {detail.cancelReason}
          </Typography>
        )}

        <Stack direction="row" spacing={1} useFlexGap className="print:hidden" sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <PrintButton />
          {canSendReceipt && receipt && <ReceiptPrintButton invoiceId={detail.id} receipt={receipt} />}
        {canSendReceipt && <ReceiptSendDialog invoiceId={detail.id} />}
          {canSendReceipt && <ReceiptResetDialog invoiceId={detail.id} />}
          {canDiscount && (
            <FinalDiscountDialog invoiceId={detail.id} subtotal={totals.subtotal} currentDiscount={totals.discount} paid={totals.paid} />
          )}
          {canCancel && <CancelInvoiceDialog invoiceId={detail.id} label={detail.number ?? "Tagihan"} />}
        </Stack>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Jumlah</TableCell>
                <TableCell align="right">Harga</TableCell>
                <TableCell align="right">Jumlah harga</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Box component="span" sx={{ fontWeight: 500 }}>
                      {line.name}
                    </Box>
                    <Typography variant="caption" component="div" sx={{ color: "text.secondary" }}>
                      {INVOICE_LINE_KIND_LABEL[line.kind]}
                      {line.priceNote && ` · ${line.priceNote}`}
                    </Typography>
                    <LineDiscountNote line={line} />
                  </TableCell>
                  <TableCell align="right">{line.quantity}</TableCell>
                  <TableCell align="right">{formatRupiah(line.unitPrice)}</TableCell>
                  <TableCell align="right">
                    {line.discountAmount > 0 && (
                      <Typography variant="caption" component="div" sx={{ textDecoration: "line-through", color: "text.secondary" }}>
                        {formatRupiah(line.gross)}
                      </Typography>
                    )}
                    {formatRupiah(line.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box component="section" aria-label="Ringkasan tagihan" sx={{ alignSelf: "flex-end", width: "100%", maxWidth: 320, fontSize: "0.875rem" }}>
          <Stack spacing={0.5}>
            <Stack direction="row" sx={row}>
              <span>Subtotal</span>
              <span>{formatRupiah(totals.grossSubtotal)}</span>
            </Stack>
            {totals.itemDiscount > 0 && (
              <Stack direction="row" sx={row}>
                <span>Diskon item</span>
                <span>-{formatRupiah(totals.itemDiscount)}</span>
              </Stack>
            )}
            {totals.discount > 0 && (
              <Box>
                <Stack direction="row" sx={row}>
                  <span>Diskon</span>
                  <span>-{formatRupiah(totals.discount)}</span>
                </Stack>
                <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
                  {detail.discountReason}
                  {detail.discountByName && ` (${detail.discountByName})`}
                </Typography>
              </Box>
            )}
            <Stack direction="row" sx={{ ...row, fontSize: "1rem", fontWeight: 600 }}>
              <span>Total</span>
              <span>{formatRupiah(totals.total)}</span>
            </Stack>
            <Stack direction="row" sx={row}>
              <span>Dibayar</span>
              <span>{formatRupiah(totals.paid)}</span>
            </Stack>
            <Stack direction="row" sx={{ ...row, fontWeight: 500 }}>
              <span>Sisa</span>
              <span>{formatRupiah(totals.balance)}</span>
            </Stack>
            {canSeeCost && detail.cost !== null && (
              <Typography variant="caption" component="p" className="print:hidden" sx={{ pt: 1, color: "text.secondary" }}>
                Harga pokok barang {formatRupiah(detail.cost)}
              </Typography>
            )}
          </Stack>
        </Box>

        <SectionCard
          title="Pembayaran"
          flush
          actions={canPay ? <InvoicePaymentDialog invoiceId={detail.id} limit={totals.balance} finalizedDate={finalizedDate} today={today} bankAccounts={bankAccounts} /> : undefined}
        >
          {detail.payments.length === 0 ? (
            <Typography variant="body2" sx={{ p: 2, color: "text.secondary" }}>
              Belum ada pembayaran.
            </Typography>
          ) : (
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, fontSize: "0.875rem", "& > li + li": { borderTop: 1, borderColor: "divider" } }}>
              {detail.payments.map((payment) => {
                const label = `${formatRupiah(payment.amount)} ${dateLabel(payment.paidAt)}`;
                return (
                  <Box
                    component="li"
                    key={payment.id}
                    sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1, px: 2, py: 1 }}
                  >
                    <Box component="span" sx={payment.revokedAt ? { color: "text.secondary", textDecoration: "line-through" } : undefined}>
                      {dateLabel(payment.paidAt)} · {formatRupiah(payment.amount)} · {PAYMENT_METHOD_LABEL[payment.method]}
                      {payment.reference && ` · Ref. ${payment.reference}`}
                      {payment.destinationLabel && (
                        <Box component="span" sx={{ display: "block", fontSize: "0.75rem" }}>
                          Ke {payment.destinationLabel}
                          {(payment.senderBank || payment.senderAccountName || payment.senderAccountNumber) &&
                            ` · Dari ${[payment.senderBank, payment.senderAccountNumber, payment.senderAccountName && `a.n. ${payment.senderAccountName}`].filter(Boolean).join(" ")}`}
                        </Box>
                      )}
                      <Box component="span" sx={{ display: "block", fontSize: "0.75rem" }}>
                        {payment.staffName}
                      </Box>
                    </Box>
                    {payment.revokedAt ? (
                      <Box component="span" sx={{ fontSize: "0.75rem", color: "error.main" }}>
                        Dibatalkan oleh {payment.revokedByName}: {payment.revokeReason}
                      </Box>
                    ) : (
                      canCorrect && <RevokeInvoicePaymentDialog paymentId={payment.id} label={label} />
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </SectionCard>
        <InvoiceNotesForm invoiceId={detail.id} notes={detail.notes} canEdit={canEditNotes} />
      </Stack>
      {receipt && <ReceiptPaper receipt={receipt} className="struk-hanya-cetak" />}
    </>
  );
}

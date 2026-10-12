import { formatRupiah } from "@/lib/format";
import { formatReceiptDateTime, RECEIPT_STATUS_LABEL, type PublicReceipt } from "@/lib/receipt";
import { dateLabel, PAYMENT_METHOD_LABEL } from "@/lib/stock";

// Struk bergaya kertas kasir (spec struk WA 6, 7.3). Tanpa MUI dan Tailwind: dipakai halaman publik dan panel.

function Row({ left, right, strong = false }: { left: string; right: string; strong?: boolean }) {
  return (
    <div className="struk-baris" style={strong ? { fontWeight: 700 } : undefined}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

export function ReceiptPaper({ receipt, className = "" }: { receipt: PublicReceipt; className?: string }) {
  return (
    <section aria-label={`Struk ${receipt.number}`} className={`struk-kertas ${className}`.trim()}>
      <div className="struk-tengah">
        <strong>{receipt.clinicName}</strong>
        <div>{receipt.branchName}</div>
        <div>{receipt.branchAddress}</div>
      </div>
      <hr />
      <Row left="No." right={receipt.number} />
      <Row left="Tanggal" right={formatReceiptDateTime(receipt.finalizedAt)} />
      <Row left="Kasir" right={receipt.cashierName} />
      <Row left="Atas nama" right={receipt.customerName} />
      <hr />
      <ul aria-label="Item" className="struk-daftar">
        {receipt.lines.map((line, index) => (
          <li key={index}>
            <div>{line.name}</div>
            <Row left={`${line.quantity} x ${formatRupiah(line.unitPrice)}`} right={formatRupiah(line.amount)} />
          </li>
        ))}
      </ul>
      <hr />
      <Row left="Subtotal" right={formatRupiah(receipt.subtotal)} />
      {receipt.discount > 0 && <Row left="Diskon" right={`-${formatRupiah(receipt.discount)}`} />}
      <Row left="Total" right={formatRupiah(receipt.total)} strong />
      {receipt.payments.map((payment, index) => (
        <Row key={index} left={`${dateLabel(payment.paidAt)} · ${PAYMENT_METHOD_LABEL[payment.method]}`} right={formatRupiah(payment.amount)} />
      ))}
      {receipt.balance > 0 && <Row left="Sisa" right={formatRupiah(receipt.balance)} strong />}
      <div className="struk-tengah struk-penutup">
        <strong>{RECEIPT_STATUS_LABEL[receipt.status]}</strong>
        <div>Terima kasih</div>
      </div>
    </section>
  );
}
